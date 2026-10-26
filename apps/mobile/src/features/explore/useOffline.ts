import NetInfo from "@react-native-community/netinfo";
import { useEffect, useState } from "react";

import { isOffline } from "./offline-logic";

/**
 * Whether the device is offline, from NetInfo. Figma shows the offline state inside the sheet (89:391), not as a
 * banner over the globe — this hook only answers; the sheet decides what to draw. `refresh` re-asks the platform so
 * `Try again` can act before NetInfo's own event arrives.
 */
export function useOffline(): { offline: boolean; refresh: () => Promise<boolean> } {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sub = NetInfo.addEventListener((s) => setOffline(isOffline(s)));
    return () => sub();
  }, []);

  async function refresh(): Promise<boolean> {
    const next = isOffline(await NetInfo.fetch());
    setOffline(next);
    return next;
  }

  return { offline, refresh };
}
