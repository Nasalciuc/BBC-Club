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

# The screen at a failure, in the job log itself: whether the keyboard is up (and where), every element that has a
# testID with its bounds, the text on screen, the native screen stack, and the device log of this flow (JS errors and
# crashes only, never console.log). Screenshots are in the uploaded artifact (--debug-output).
screen_state() {
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
  # ReactNativeJS:W is how a Hermes error (for example a missing `crypto`) reaches this log.
  adb logcat -d -v brief '*:S' ReactNativeJS:W ReactNative:W ReactNativeJNI:W AndroidRuntime:E libc:F DEBUG:F |
    tail -n 60 || true
}

status=0
for flow in register sign-in search-and-request delete-account; do
  echo "::group::maestro $flow"
  adb logcat -c || true
  if ! maestro test --format junit --output "$OUT/$flow.xml" --debug-output "$OUT/debug/$flow" \
    "apps/mobile/e2e/$flow.yaml"; then
    echo "::error::Maestro flow failed: $flow"
    screen_state
    status=1
  fi
  echo "::endgroup::"
done
exit "$status"
