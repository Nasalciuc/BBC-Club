import { useEffect, useState } from "react";
import type { AirportVM, HomeVM } from "@bbc/shared/api/v1/fares";

import { airportByCode } from "@/lib/airport-by-code";
import { fetchHome, fetchProfile } from "@/lib/api";
import { readFailureCopy, stateCopy } from "@/lib/error-context";

const JFK: AirportVM = {
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

export function useExploreHome() {
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

  // The search starts from the member's home airport: Home's own `home` once it has loaded, else the profile's airport,
  // else New York. Nothing is decided while Home is loading — a default taken then would stand for the session.
  useEffect(() => {
    if (homeLoading) return;
    if (home?.home) {
      setDefaultFrom(home.home);
      return;
    }
    let cancelled = false;
    void (async () => {
      const profile = await fetchProfile();
      const code = profile.ok ? profile.data.homeAirport : null;
      if (code) {
        const match = home?.destinations.find((d) => d.code === code);
        const airport = match ? airportOf(match) : await airportByCode(code);
        if (cancelled) return;
        if (airport) {
          setDefaultFrom(airport);
          return;
        }
      }
      if (!cancelled) setDefaultFrom(JFK);
    })().catch(() => {
      if (!cancelled) setDefaultFrom(JFK);
    });
    return () => {
      cancelled = true;
    };
  }, [home, homeLoading]);

  useEffect(() => {
    const t = setTimeout(() => {
      void (async () => {
        const profile = await fetchProfile();
        if (!profile.ok || !profile.data.homeAirport) return;
        const code = profile.data.homeAirport;
        if (home?.home?.code === code) {
          setDefaultFrom(home.home);
          return;
        }
        const match = home?.destinations.find((d) => d.code === code);
        if (match) setDefaultFrom(airportOf(match));
      })();
    }, 2000);
    return () => clearTimeout(t);
  }, [home]);

  return { home, homeLoading, homeError, defaultFrom, retryHome };
}
