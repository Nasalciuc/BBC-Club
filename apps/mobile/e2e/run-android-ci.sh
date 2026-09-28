#!/usr/bin/env bash
# Runs inside reactivecircus/android-emulator-runner (.github/workflows/e2e-android.yml): the emulator is booted,
# the API listens on the runner at :8000 (the APK reaches it as 10.0.2.2:8000; Maestro's evalScript as localhost).
# Order matters: sign-in leaves the session search-and-request uses; delete-account removes the fixture member last.
set -uo pipefail
APK="apps/mobile/android/app/build/outputs/apk/release/app-release.apk"
OUT="e2e-results"
mkdir -p "$OUT"
adb install -r "$APK"
status=0
for flow in register sign-in search-and-request delete-account; do
  echo "::group::maestro $flow"
  if ! maestro test --format junit --output "$OUT/$flow.xml" "apps/mobile/e2e/$flow.yaml"; then
    echo "::error::Maestro flow failed: $flow"
    status=1
  fi
  echo "::endgroup::"
done
exit "$status"
