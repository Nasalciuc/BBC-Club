import { AirportVM } from "@bbc/shared/api/v1/fares";
import { z } from "zod";
import { appStorage } from "@/lib/storage-keys";

export const RECENT_AIRPORTS_KEY = "bbcclub.recentAirports";

const RecentAirports = z.array(AirportVM);

export function readRecentAirports(): AirportVM[] {
  const raw = appStorage.getString(RECENT_AIRPORTS_KEY);
  if (!raw) return [];
  try {
    const parsed = RecentAirports.safeParse(JSON.parse(raw));
    if (!parsed.success) return [];
    return parsed.data.slice(0, 5);
  } catch {
    return [];
  }
}

export function rememberAirport(airport: AirportVM): AirportVM[] {
  const next = [airport, ...readRecentAirports().filter((a) => a.code !== airport.code)].slice(0, 5);
  appStorage.set(RECENT_AIRPORTS_KEY, JSON.stringify(next));
  return next;
}
