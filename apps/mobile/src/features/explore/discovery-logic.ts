import type { AirportVM } from "@bbc/shared/api/v1/fares";

/** The section label of 536:11093: `POPULAR FROM NEW YORK`. SectionLabel uppercases; this names the city. */
export function popularLabel(from: Pick<AirportVM, "city">): string {
  return `Popular from ${from.city}`;
}

/** Figma 536:11093 shows at most four popular rows, none that already sits under RECENT, never the origin itself. */
export function popularRows(
  popular: readonly AirportVM[],
  recent: readonly Pick<AirportVM, "code">[],
  from: Pick<AirportVM, "code"> | null,
  max = 4,
): AirportVM[] {
  const taken = new Set(recent.map((a) => a.code));
  if (from) taken.add(from.code);
  return popular.filter((a) => !taken.has(a.code)).slice(0, max);
}

/** The phone's IANA zone for GET /v1/airports/home-suggestion — null when the runtime has none to give. */
export function deviceTimeZone(resolve: () => string | undefined = defaultResolve): string | null {
  try {
    const tz = resolve();
    return tz && tz.includes("/") ? tz : null; // "UTC" or an abbreviation names no place
  } catch {
    return null;
  }
}

function defaultResolve(): string | undefined {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
