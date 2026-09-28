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

# The screen at a failure, in the job log itself: whether the keyboard is up (and where), and every element that
# has a testID with its bounds. Screenshots are in the uploaded artifact (--debug-output).
screen_state() {
  adb shell dumpsys input_method | grep -E "mInputShown" || true
  adb shell dumpsys window | grep -E "InsetsSource.*type=ime" | head -3 || true
  adb exec-out uiautomator dump /dev/tty 2>/dev/null | tr '>' '\n' |
    grep -E 'resource-id="[a-zA-Z]' | sed -E 's/.*resource-id="([^"]*)".*bounds="([^"]*)".*/  \1 \2/' || true
}

status=0
for flow in register sign-in search-and-request delete-account; do
  echo "::group::maestro $flow"
  if ! maestro test --format junit --output "$OUT/$flow.xml" --debug-output "$OUT/debug/$flow" \
    "apps/mobile/e2e/$flow.yaml"; then
    echo "::error::Maestro flow failed: $flow"
    screen_state
    status=1
  fi
  echo "::endgroup::"
done
exit "$status"
