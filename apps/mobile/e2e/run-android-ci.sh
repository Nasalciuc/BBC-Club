#!/usr/bin/env bash
# Runs inside reactivecircus/android-emulator-runner (.github/workflows/e2e-android.yml): the emulator is booted,
# the API listens on the runner at :8000 (the APK reaches it as 10.0.2.2:8000; Maestro's evalScript as localhost).
# Order matters: sign-in leaves the session search-and-request uses; delete-account removes the fixture member last.
set -uo pipefail
APK="apps/mobile/android/app/build/outputs/apk/release/app-release.apk"
OUT="e2e-results"
mkdir -p "$OUT"
adb install -r "$APK"
adb shell wm size
adb shell wm density

# The action already waited for sys.boot_completed. An ANR of our app fails the job.
# Wait is only for the Pixel Launcher dialog, which is the emulator home screen, not our process.
boot=$(adb shell getprop sys.boot_completed | tr -d '\r')
echo "sys.boot_completed=${boot}"
if [ "$boot" != "1" ]; then
  echo "::warning::sys.boot_completed is '${boot}', expected 1"
fi

tap_wait() {
  local ui line bounds x y
  ui=$(adb exec-out uiautomator dump /dev/tty 2>/dev/null || true)
  line=$(printf '%s\n' "$ui" | tr '>' '>\n' | grep -F 'text="Wait"' | head -1 || true)
  if [ -z "$line" ]; then
    echo "  Wait button not in the hierarchy"
    return 1
  fi
  bounds=$(printf '%s\n' "$line" | sed -nE 's/.*bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]".*/\1 \2 \3 \4/p')
  if [ -z "$bounds" ]; then
    echo "  Wait button has no bounds"
    return 1
  fi
  # shellcheck disable=SC2086
  set -- $bounds
  x=$((($1 + $3) / 2))
  y=$((($2 + $4) / 2))
  echo "  tap Wait at ${x},${y}"
  adb shell input tap "$x" "$y"
}

deadline=$((SECONDS + 60))
last=""
idle=0
our_anr=0
while [ "$SECONDS" -lt "$deadline" ]; do
  sample=$(adb shell dumpsys window 2>/dev/null | grep -E "mCurrentFocus|mFocusedApp|Application Not Responding" | head -20 || true)
  echo "  -- launcher settle"
  if [ -n "$sample" ]; then
    printf '%s\n' "$sample" | sed 's/^/  /'
  else
    echo "  (no focus or ANR lines)"
  fi
  last=$sample
  if printf '%s\n' "$sample" | grep -q "Application Not Responding: com.buybusinessclass.club"; then
    echo "::error::app ANR: com.buybusinessclass.club"
    our_anr=1
    break
  fi
  if ! printf '%s\n' "$sample" | grep -qF "Application Not Responding"; then
    echo "  launcher idle"
    idle=1
    break
  fi
  if printf '%s\n' "$sample" | grep -q "Application Not Responding: com.google.android.apps.nexuslauncher"; then
    tap_wait || true
  fi
  sleep 2
done
if [ "$our_anr" -eq 1 ]; then
  printf '%s\n' "$last"
  exit 1
fi
if [ "$idle" -eq 0 ]; then
  echo "::warning::Pixel Launcher was not idle within 60s; Maestro will tap Wait if the dialog is still up"
  printf '%s\n' "$last"
fi

# The screen at a failure, in the job log itself: whether the keyboard is up (and where), every element that has a
# testID with its bounds, the text on screen, the native screen stack, and the device log of this flow (JS errors and
# crashes only, never console.log). Screenshots are in the uploaded artifact (--debug-output).
screen_state() {
  echo "  -- focus"
  adb shell dumpsys window | grep -E "mCurrentFocus|mFocusedApp" | head -3 || true
  adb shell dumpsys input_method | grep -E "mInputShown" || true
  adb shell dumpsys window | grep -E "InsetsSource.*type=ime" | head -3 || true
  local ui
  ui=$(adb exec-out uiautomator dump /dev/tty 2>&1)
  echo "$ui" | tr '>' '\n' |
    grep -E 'resource-id="[a-zA-Z]' | sed -E 's/.*resource-id="([^"]*)".*bounds="([^"]*)".*/  \1 \2/' || true
  echo "  -- text on screen"
  echo "$ui" | grep -oE 'text="[^"]+"' | sed -E 's/^text="[0-9 ]+"$/text="[digits redacted]"/' | head -20 | sed 's/^/ /' || true
  echo "$ui" | grep -qE '<hierarchy' || echo "  (no hierarchy: ${ui:0:200})"
  echo "  -- screen stack of the top activity"
  adb shell dumpsys activity top | grep -E "ScreenStack|ScreenContainer|Screen\{|ScreenFragment|ReactSurface|ReactRoot" |
    head -20 || true
  echo "  -- device log (errors and warnings)"
  # Warning and above, so a Hermes ReferenceError (for example a missing crypto) is in this log.
  adb logcat -d -v brief '*:S' ReactNativeJS:W ReactNative:W ReactNativeJNI:W AndroidRuntime:E libc:F DEBUG:F |
    tail -n 60 || true
}

# Named exceptions only. Each entry is a substring of one E/ReactNativeJS or FATAL line,
# and the comment above it must say why that line is not a product bug. Empty means every such line fails the job.
JS_ERROR_ALLOWLIST=()

js_error_lines() {
  adb logcat -d -v brief '*:S' ReactNativeJS:E AndroidRuntime:E |
    grep -E 'E/ReactNativeJS|FATAL EXCEPTION' || true
}

status=0
for flow in register sign-in search-and-request delete-account; do
  echo "::group::maestro $flow"
  adb logcat -c || true
  flow_failed=0
  if ! maestro test --format junit --output "$OUT/$flow.xml" --debug-output "$OUT/debug/$flow" \
    "apps/mobile/e2e/$flow.yaml"; then
    echo "::error::Maestro flow failed: $flow"
    flow_failed=1
    status=1
  fi
  errors=$(js_error_lines)
  if [ -n "$errors" ]; then
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      allowed=0
      for pattern in "${JS_ERROR_ALLOWLIST[@]+"${JS_ERROR_ALLOWLIST[@]}"}"; do
        if printf '%s\n' "$line" | grep -qF "$pattern"; then
          allowed=1
          echo "  allowed JS error ($flow): $line"
          break
        fi
      done
      if [ "$allowed" -eq 0 ]; then
        echo "::error::E/ReactNativeJS or FATAL in $flow"
        printf '%s\n' "$line"
        status=1
        flow_failed=1
      fi
    done <<EOF
$errors
EOF
  fi
  if [ "$flow_failed" -eq 1 ]; then
    screen_state
  fi
  echo "::endgroup::"
done
exit "$status"
