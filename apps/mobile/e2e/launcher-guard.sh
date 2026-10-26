# ---- sourced by run-android-ci.sh after sys.boot_completed ----------------------------------------
LAUNCHER=com.google.android.apps.nexuslauncher
APP=com.buybusinessclass.club

anr_windows() {   # every "Application Not Responding" window currently on screen, one per line
  adb shell dumpsys window windows 2>/dev/null | tr -d '\r' \
    | grep -oE "Application Not Responding: [A-Za-z0-9._]+" | sort -u || true
}

anr_evidence() {  # the reason and the main-thread stack — printed BEFORE anything is tapped or killed
  echo "-- ANR evidence ($1)"
  adb logcat -d -b main,system -s ActivityManager:E 2>/dev/null | tr -d '\r' | grep -A12 "ANR in" | head -40 || true
  adb root >/dev/null 2>&1 || true
  adb wait-for-device
  local latest
  latest=$(adb shell 'ls -t /data/anr 2>/dev/null | head -1' | tr -d '\r')
  if [ -n "$latest" ]; then
    echo "   trace /data/anr/$latest — main thread:"
    adb shell "cat /data/anr/$latest" 2>/dev/null | tr -d '\r' | awk '/^"main"/{p=1} p{print "   " $0; if (++n > 25) exit}' || true
  else
    echo "   (no trace file in /data/anr)"
  fi
}

remove_launcher_from_test() {
  # 1 · evidence first
  if [ -n "$(anr_windows)" ]; then anr_evidence "at boot"; fi
  # 2 · the launcher is not under test: Maestro starts our app by package name
  adb shell pm disable-user --user 0 "$LAUNCHER" >/dev/null 2>&1 || true
  if ! adb shell pm list packages -d 2>/dev/null | tr -d '\r' | grep -q "$LAUNCHER"; then
    echo "::error::could not disable $LAUNCHER"; return 1
  fi
  echo "-- launcher disabled: $LAUNCHER"
  # 3 · verify: no ANR window left, and Home does not misbehave
  local i
  for i in $(seq 1 30); do [ -z "$(anr_windows)" ] && break; sleep 2; done
  if [ -n "$(anr_windows)" ]; then echo "::error::ANR window still present: $(anr_windows | tr '\n' ' ')"; return 1; fi
  adb shell input keyevent 3; sleep 3
  echo "-- after Home: $(adb shell dumpsys window 2>/dev/null | tr -d '\r' | grep -m1 'mCurrentFocus')"
  if [ -n "$(anr_windows)" ]; then echo "::error::Home produced an ANR: $(anr_windows | tr '\n' ' ')"; return 1; fi
}

ANR_SEEN=0
check_anr_after_flow() {   # 4 · report every process's ANR; fail only on ours
  local w; w=$(anr_windows)
  [ -z "$w" ] && return 0
  ANR_SEEN=$((ANR_SEEN + 1))
  echo "-- ANR windows after $1: $(echo "$w" | tr '\n' ' ')"
  anr_evidence "after $1"
  if echo "$w" | grep -q "$APP"; then echo "::error::our app ANR'd during $1"; return 1; fi
  echo "::warning::system ANR during $1 (not our app): $(echo "$w" | tr '\n' ' ')"
}
