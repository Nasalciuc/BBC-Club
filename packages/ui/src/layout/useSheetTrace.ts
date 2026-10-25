import { type RefObject, useEffect } from "react";
import { Dimensions, type View } from "react-native";
import type { SharedValue } from "react-native-reanimated";

import { drawnTopOf, formatSheetLook } from "./sheet-trace";

/** How often the sheet is looked at while its screen is on screen; a line is logged only when it changes. */
const LOOK_EVERY_MS = 1000;

/**
 * While `enabled` (the app's e2e builds, decided by the app: HomeSheet's `trace`) and the screen is on screen, logs
 * where gorhom holds the sheet and where the committed tree puts it, once on focus and then on each change
 * (sheet-trace.ts). Read-only: a measure and two shared-value reads, no render, no snap — it never hides what it
 * reports. `drawn` is a view inside gorhom's animated body (the sheet's background), so its transform is the sheet's.
 */
export function useSheetTrace(
  enabled: boolean,
  index: number,
  drawn: RefObject<View | null>,
  sheetIndex: SharedValue<number>,
  position: SharedValue<number>,
) {
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    let last = "";
    function log(drawnTop: number | null) {
      if (!live) return;
      const line = formatSheetLook({
        index,
        sheetIndex: sheetIndex.get(),
        position: position.get(),
        drawnTop,
        windowHeight: Dimensions.get("window").height,
      });
      if (line === last) return;
      last = line;
      console.log(line);
    }
    function look() {
      const view = drawn.current;
      if (view) view.measureInWindow((_x, y, width, height) => log(drawnTopOf(y, width, height)));
      else log(null);
    }
    look();
    const timer = setInterval(look, LOOK_EVERY_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [enabled, index, drawn, sheetIndex, position]);
}
