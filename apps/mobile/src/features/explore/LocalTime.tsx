import { useEffect, useState } from "react";
import { SectionLabel } from "@bbc/ui";

import { localTimeLabel, msToNextMinute } from "./local-time";

type Props = {
  label: string;
  city: string;
  tz: string | undefined;
};

/**
 * A section label that carries the destination's local time at its right edge (Figma 536:10864, `3 FARES · LOWEST
 * FIRST` … `LONDON · 8:42 PM`), re-rendered on the minute. Without a zone it is a plain SectionLabel.
 */
export function SectionLabelWithLocalTime({ label, city, tz }: Props) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!tz) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(new Date());
      timer = setTimeout(tick, msToNextMinute());
    };
    timer = setTimeout(tick, msToNextMinute());
    return () => clearTimeout(timer);
  }, [tz]);

  const time = localTimeLabel(city, tz, now);
  return <SectionLabel label={label} trailing={time ? { label: time, testID: "explore.localTime" } : null} />;
}
