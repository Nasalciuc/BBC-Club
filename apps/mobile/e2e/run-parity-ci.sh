#!/usr/bin/env bash
# Parity screenshots only. Does not replace run-android-ci.sh and does not change its guardrails.
# Density 440 on the Pixel 6 (1080 px) is 392.7 dp, the frames' width. Height stays the device's.
set -uo pipefail
APK="apps/mobile/android/app/build/outputs/apk/release/app-release.apk"
OUT="e2e-results/parity"
mkdir -p "$OUT"
adb install -r "$APK"

boot=$(adb shell getprop sys.boot_completed | tr -d '\r')
echo "sys.boot_completed=${boot}"
if [ "$boot" != "1" ]; then
  echo "::warning::sys.boot_completed is '${boot}', expected 1"
fi

# shellcheck disable=SC1091
source apps/mobile/e2e/launcher-guard.sh
# shellcheck disable=SC1091
source apps/mobile/e2e/failure-note.sh
remove_launcher_from_test || exit 1

adb shell wm density 440
adb shell wm density
adb shell wm size

echo "-- clocks"
date -u
adb shell date

JS_ERROR_ALLOWLIST=()

# As run-android-ci.sh: E/ReactNativeJS is the app's own JS. A FATAL EXCEPTION counts only when the line after it names
# the app's process ($APP, launcher-guard.sh): disabling the launcher can crash com.android.systemui, which is not under
# test. Another process's crash is shown, never counted.
js_error_lines() {
  adb logcat -d -v brief '*:S' ReactNativeJS:E AndroidRuntime:E | tr -d '\r' |
    awk -v app="$APP" '
      /E\/ReactNativeJS/ { print; next }
      /FATAL EXCEPTION/ { fatal = $0; next }
      fatal != "" {
        if (index($0, "Process: " app ",") > 0) print fatal " (" app ")"
        else print "  not under test: " $0 > "/dev/stderr"
        fatal = ""
      }' || true
}

# Explore's sheet as the e2e build saw it (packages/ui/src/layout/sheet-trace.ts): a line on each focus of Explore and
# on each change while it is on screen — the verdict (drawn, lost, closed, moving, astray, elsewhere, unmeasured), the
# stop asked for, gorhom's index and position, and the sheet's top in the committed tree. `drawn` means the committed
# transform matches gorhom's position, not that the sheet is visible (opacity is not measured). `lost` is gorhom
# holding the sheet open while the committed transform puts it a window height down; `closed` is gorhom closing it.
# Each line ends with `sync=`, Reanimated's settled-props sync as this APK was compiled: `off` (ADR-IMPL-069). There,
# a run that loses the sheet is a failed fix whatever the verdict, and `lost` means the props were lost some other way
# than the sync; `sync=on` means the flag did not reach the build.
sheet_trace() {
  adb logcat -d -v time '*:S' ReactNativeJS:V | grep -F '[HomeSheet]' | tail -n 20 || true
}

status=0
echo "::group::maestro parity"
# A larger ring buffer, so the sheet's trace from the first arrival on Explore is still there at the end.
adb logcat -G 4M || true
adb logcat -c || true
if ! maestro test --format junit --output "$OUT/parity.xml" --debug-output "$OUT/debug" \
  "apps/mobile/e2e/parity.yaml"; then
  echo "::error::Maestro flow failed: parity"
  failure_note parity "$OUT/parity.xml" "$OUT/debug"
  trace=$(sheet_trace)
  last=$(printf '%s\n' "$trace" | tail -n 1)
  echo "::error title=Maestro parity: Explore's sheet, last trace line::$(annotation_text "${last:-no [HomeSheet] line in logcat}")"
  status=1
fi
echo "-- Explore's sheet (HomeSheet trace, e2e build)"
printf '%s\n' "${trace:-$(sheet_trace)}"
errors=$(js_error_lines)
if [ -n "$errors" ]; then
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    allowed=0
    for pattern in "${JS_ERROR_ALLOWLIST[@]+"${JS_ERROR_ALLOWLIST[@]}"}"; do
      if printf '%s\n' "$line" | grep -qF "$pattern"; then
        allowed=1
        break
      fi
    done
    if [ "$allowed" -eq 0 ]; then
      echo "::error::E/ReactNativeJS or FATAL in parity"
      printf '%s\n' "$line"
      status=1
    fi
  done <<EOF
$errors
EOF
fi
check_anr_after_flow "parity" || status=1
echo "::endgroup::"
echo "ANR windows seen this run: $ANR_SEEN"
exit "$status"
