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
remove_launcher_from_test || exit 1

adb shell wm density 440
adb shell wm density
adb shell wm size

echo "-- clocks"
date -u
adb shell date

JS_ERROR_ALLOWLIST=()

js_error_lines() {
  adb logcat -d -v brief '*:S' ReactNativeJS:E AndroidRuntime:E |
    grep -E 'E/ReactNativeJS|FATAL EXCEPTION' || true
}

status=0
echo "::group::maestro parity"
adb logcat -c || true
if ! maestro test --format junit --output "$OUT/parity.xml" --debug-output "$OUT/debug" \
  "apps/mobile/e2e/parity.yaml"; then
  echo "::error::Maestro flow failed: parity"
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
