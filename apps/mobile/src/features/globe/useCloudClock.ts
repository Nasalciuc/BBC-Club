import { useEffect, useRef, useState } from "react";

import { CLOUD_TICK_MS } from "./cloud-drift";

/**
 * The clouds' own clock (cloud-drift.ts): seconds of drift so far, moved on twice a second while the globe may move —
 * Explore on screen, the app in front, motion not reduced. Paused, the clouds stay where they are and go on from
 * there; with reduced motion they never leave their first place.
 */
export function useCloudClock(moving: boolean): number {
  const [seconds, setSeconds] = useState(0);
  const sofar = useRef(0);
  useEffect(() => {
    if (!moving) return;
    const startedAt = Date.now();
    const from = sofar.current;
    const tick = setInterval(() => {
      sofar.current = from + (Date.now() - startedAt) / 1000;
      setSeconds(sofar.current);
    }, CLOUD_TICK_MS);
    return () => clearInterval(tick);
  }, [moving]);
  return seconds;
}
