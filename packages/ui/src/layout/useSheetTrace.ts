import { type RefObject, useEffect } from "react";
import { Dimensions, type View } from "react-native";
import type { SharedValue } from "react-native-reanimated";

import { formatSheetLook } from "./sheet-trace";

/** e2e builds only, as GlobeFallback's HOLD_STILL: other builds pass gorhom nothing and log nothing. */
export const SHEET_TRACE = process.env.EXPO_PUBLIC_APP_ENV === "e2e";
/** How often the sheet is looked at while its screen is on screen; a line is logged only when it changes. */
const LOOK_EVERY_MS = 1000;

/**
 * While the screen is on screen, logs where gorhom holds the sheet and where it is drawn, once on focus and then on each
 * change (sheet-trace.ts). Read-only: a measure and two shared-value reads, no render, no snap — it never hides what it
 * reports. `drawn` is a view inside gorhom's animated body (the sheet's background), so it is drawn where the sheet is.
 */
export function useSheetTrace(
  active: boolean,
  index: number,
  drawn: RefObject<View | null>,
  sheetIndex: SharedValue<number>,
  position: SharedValue<number>,
) {
  useEffect(() => {
    if (!SHEET_TRACE || !active) return;
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
      if (view) view.measureInWindow((_x, y) => log(Number.isFinite(y) ? y : null));
      else log(null);
    }
    look();
    const timer = setInterval(look, LOOK_EVERY_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [active, index, drawn, sheetIndex, position]);
}
