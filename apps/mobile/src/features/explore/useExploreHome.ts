import { useEffect, useState } from "react";
import type { AirportVM, HomeVM } from "@bbc/shared/api/v1/fares";

import { loadProfile } from "@/features/profile/profile-store";
import { airportByCode } from "@/lib/airport-by-code";
import { fetchHome, fetchProfile } from "@/lib/api";
import { readFailureCopy, stateCopy } from "@/lib/error-context";

/** Where a search starts when neither Home nor the profile names the member's airport. */
export const DEFAULT_ORIGIN: AirportVM = {
  code: "JFK",
  city: "New York",
  name: "John F Kennedy International",
  countryCode: "US",
  lat: 40.6413,
  lng: -73.7781,
};

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
  const [home, setHome] = useState<HomeVM | null>(null);
  const [homeEtag, setHomeEtag] = useState<string | null>(null);
  const [homeLoading, setHomeLoading] = useState(true);
  // The words of a failed load, never the network layer's own line (ADR-IMPL-047): offline says when it will load.
  const [homeError, setHomeError] = useState<{ title: string; body: string } | null>(null);
  const [defaultFrom, setDefaultFrom] = useState<AirportVM | null>(null);

  async function loadHome() {
    setHomeLoading(true);
    setHomeError(null);
    const result = await fetchHome(homeEtag);
    setHomeLoading(false);
    if (!result.ok) {
      setHomeError(readFailureCopy(result.code, "explore"));
      return;
    }
    if (!result.data.notModified) {
      setHome(result.data.home);
      setHomeEtag(result.data.etag);
    }
  }

  function retryHome() {
    void loadHome().catch(() => {
      setHomeLoading(false);
      setHomeError(stateCopy("route"));
    });
  }

  useEffect(() => {
    retryHome();
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
