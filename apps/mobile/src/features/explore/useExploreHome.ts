import { useEffect, useEffectEvent, useState } from "react";
import { AppState } from "react-native";
import type { AirportVM, HomeVM } from "@bbc/shared/api/v1/fares";

import { loadProfile } from "@/features/profile/profile-store";
import { airportByCode } from "@/lib/airport-by-code";
import { fetchHome, fetchProfile } from "@/lib/api";
import { readFailureCopy, stateCopy } from "@/lib/error-context";
import { newestOnly, nextShownHome, type ShownHome } from "@/lib/home-shown-logic";
import { DEFAULT_ORIGIN } from "./default-origin";
import { withLiveDeals } from "./offer-card-logic";

export { DEFAULT_ORIGIN };

/** A destination pin as the airport the search starts from. */
function airportOf(pin: HomeVM["destinations"][number]): AirportVM {
  return {
    code: pin.code,
    city: pin.city,
    name: pin.name,
    countryCode: pin.countryCode,
    lat: pin.lat,
    lng: pin.lng,
  };
}

/**
 * The member's airport from the profile (the one store every screen shares — no question of its own, F104): a pin
 * Home lists, else the airport looked up by its code, else New York.
 */
export async function profileOrigin(destinations: HomeVM["destinations"] = []): Promise<AirportVM> {
  const profile = await loadProfile(fetchProfile);
  const code = profile?.homeAirport;
  if (!code) return DEFAULT_ORIGIN;
  const match = destinations.find((d) => d.code === code);
  return (match ? airportOf(match) : await airportByCode(code)) ?? DEFAULT_ORIGIN;
}

/**
 * Explore's Home (GET /v1/home) and the airport its search starts from. `origin: false` — a screen that needs only
 * Home's offers (`Request received`) — resolves no origin.
 */
export function useExploreHome(opts: { origin?: boolean } = {}) {
  const wantsOrigin = opts.origin !== false;
  // Home and the tag it came with: a 304 keeps it only for that tag (home-shown-logic.ts).
  const [shown, setShown] = useState<ShownHome | null>(null);
  const home = shown?.home ?? null;
  const [homeLoading, setHomeLoading] = useState(true);
  // The words of a failed load, never the network layer's own line (ADR-IMPL-047): offline says when it will load.
  const [homeError, setHomeError] = useState<{ title: string; body: string } | null>(null);
  const [defaultFrom, setDefaultFrom] = useState<AirportVM | null>(null);
  // The mount's load and a foreground's can overlap: only the newest one touches the screen (home-shown-logic.ts).
  const [startLoad] = useState(newestOnly);

  async function loadHome(isNewest: () => boolean) {
    setHomeLoading(true);
    setHomeError(null);
    // The client asks with the tag of what this session last received, from the first load on (lib/api.ts): a 304
    // keeps what is on screen when it came with that tag, else brings back the copy held for the session.
    const result = await fetchHome();
    if (!isNewest()) return;
    setHomeLoading(false);
    if (!result.ok) {
      setHomeError(readFailureCopy(result.code, "explore"));
      return;
    }
    const answer = result.data;
    setShown((current) => nextShownHome(current, answer));
  }

  function retryHome() {
    const isNewest = startLoad();
    void loadHome(isNewest).catch(() => {
      if (!isNewest()) return;
      setHomeLoading(false);
      setHomeError(stateCopy("route"));
    });
  }

  useEffect(() => {
    retryHome();
  }, []);

  // ADR-IMPL-067 (D6): a site deal is good for a day after the site was read, and Home is read once, when the screen
  // mounts. A phone can keep the app a day in the background: back in the foreground, the deals past their day leave at
  // once — even with no network — and Home is read again for today's. An effect event: it reads the Home on screen
  // when the app comes back, and the listener stays the one added on mount.
  const onForeground = useEffectEvent(() => {
    if (!shown) return;
    const live = withLiveDeals(shown.home, Date.now());
    if (!live || live === shown.home) return;
    // Still the copy of that tag, less the deals past their day: a 304 for the tag keeps it.
    setShown({ home: live, etag: shown.etag });
    retryHome();
  });
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") onForeground();
    });
    return () => subscription.remove();
  }, []);

  // The search starts from the member's home airport: Home's own `home` once it has loaded, else the profile's airport
  // (read from the shared store, never asked again here), else New York. Nothing is decided while Home is loading — a
  // default taken then would stand for the session.
  useEffect(() => {
    if (!wantsOrigin || homeLoading) return;
    if (home?.home) {
      setDefaultFrom(home.home);
      return;
    }
    let cancelled = false;
    void (async () => {
      const airport = await profileOrigin(home?.destinations);
      if (!cancelled) setDefaultFrom(airport);
    })().catch(() => {
      if (!cancelled) setDefaultFrom(DEFAULT_ORIGIN);
    });
    return () => {
      cancelled = true;
    };
  }, [home, homeLoading, wantsOrigin]);

  return { home, homeLoading, homeError, defaultFrom, retryHome };
}
