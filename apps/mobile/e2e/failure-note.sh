# ---- sourced by run-android-ci.sh and run-parity-ci.sh ----------------------------------------------------------
# Why a Maestro flow failed, as annotations on the check run: the checks API returns those to anyone, where the job
# log and the uploaded artifact have to be downloaded. The full screen state stays in the log (screen_state).

# One line a workflow command can carry: no newline, and % escaped.
annotation_text() {
  printf '%s' "$1" | tr '\r\n' '  ' | sed 's/%/%25/g' | cut -c1-1500
}

# The failing step (its number among the flow's own steps, what it looked for and Maestro's words), from the debug
# output's commands file, then Maestro's message from the JUnit report.
maestro_failure() {
  python3 - "$1" "$2" <<'PY' 2>/dev/null || true
import json, os, sys, xml.etree.ElementTree as ET

junit, debug = sys.argv[1], sys.argv[2]
notes = []
for folder, _dirs, files in os.walk(debug):
    for name in sorted(files):
        if not (name.startswith("commands") and name.endswith(".json")):
            continue
        try:
            with open(os.path.join(folder, name)) as f:
                steps = json.load(f)
        except Exception:
            continue
        top = 0
        for step in steps:
            meta = step.get("metadata") or {}
            if meta.get("depth", 0) == 0:
                top += 1
            if meta.get("status") != "FAILED":
                continue
            command = step.get("command") or {}
            kind = next(iter(command), "?")
            body = command.get(kind) or {}
            target = body.get("selector") or (body.get("condition") or {}).get("visible") or {}
            sought = target.get("idRegex") or target.get("textRegex") or json.dumps(target, separators=(",", ":"))
            words = (meta.get("error") or {}).get("message") or ""
            notes.append(f"step {top} {kind} {sought}: {words}".strip())
try:
    for failure in ET.parse(junit).getroot().iter("failure"):
        text = " ".join((failure.text or "").split())
        if text:
            notes.append(text)
        break
except Exception:
    pass
print(" | ".join(notes[:3]))
PY
}

# The testIDs on the screen when the flow stopped, with their bounds in pixels.
screen_ids() {
  adb exec-out uiautomator dump /dev/tty 2>/dev/null | tr '>' '\n' |
    grep -E 'resource-id="[a-zA-Z]' | sed -E 's/.*resource-id="([^"]*)".*bounds="([^"]*)".*/\1\2/' | tr '\n' ' ' || true
}

# failure_note <flow> <junit.xml> <debug-dir>
failure_note() {
  local flow=$1 why ids
  why=$(maestro_failure "$2" "$3")
  if [ -n "$why" ]; then
    echo "::error title=Maestro ${flow}: the step that failed::$(annotation_text "$why")"
  fi
  ids=$(screen_ids)
  echo "::error title=Maestro ${flow}: testIDs on screen::$(annotation_text "${ids:-none}")"
}
