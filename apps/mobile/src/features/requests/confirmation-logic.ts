import type { HomeVM } from "@bbc/shared/api/v1/fares";
import type { ProposalCardVM } from "@bbc/shared/api/v1/proposals";

/** Which confirmation the member sees after a request: an offer's or a search's (08), or the one saved offline (26). */
export type RequestSource = "offer" | "search";
export type ConfirmationKind = "offer" | "search" | "saved";
export function confirmationKind(source: RequestSource, queuedOffline: boolean): ConfirmationKind {
  return queuedOffline ? "saved" : source;
}

/**
 * The request's facts on two lines, as Figma 135:856 sets them: the route and the dates, then the trip and the
 * travelers (`JFK → LHR · OCT 12–19` / `ROUND TRIP · 1 ADULT`). Facts of another shape stay on one line.
 */
export function factsLines(facts: string): string[] {
  const parts = facts.split(" · ").filter(Boolean);
  if (parts.length < 4) return facts ? [facts] : [];
  return [parts.slice(0, 2).join(" · "), parts.slice(2).join(" · ")];
}

/** Minutes to show on the "too many requests" screen (frame 481:9061). Retry-After is seconds; never show 0 or a fraction. */
export function retryMinutes(retryAfterS: number | undefined): number {
  if (retryAfterS === undefined || !Number.isFinite(retryAfterS) || retryAfterS <= 0) return 1;
  return Math.max(1, Math.ceil(retryAfterS / 60));
}

/** Call buttons exist only when a verified support number is configured (EXPO_PUBLIC_SUPPORT_PHONE) — the rule since #39. */
export function telHref(phone: string | undefined): string | null {
  const digits = phone?.replace(/[^\d+]/g, "") ?? "";
  return digits.length >= 8 ? `tel:${digits}` : null;
}

/**
 * Why a request's details cannot go, in the sheet's own words — the first problem only, calmly, with what to do
 * (DESIGN.md, Product Content). Checked before a request is sent or saved on the phone: a request saved with details
 * the server refuses could never leave it.
 */
export function bodyProblem(issues: readonly { path: readonly (string | number)[]; message: string }[]): string | null {
  const first = issues[0];
  if (!first) return null;
  const where = first.path.join(".");
  if (where === "contact.name") return "Add your name, so your specialist knows who to ask for.";
  if (where === "contact.email") return "Add an email address we can write to.";
  if (where === "contact.phone") return first.message;
  if (where === "note") return "Keep the note under 500 characters.";
  if (where.startsWith("legs")) return "Check your dates and try again.";
  return first.message;
}

/** `Round trip · 1 adult` (08): the trip and the travelers the request asked for; none when neither is known. */
export function tripFacts(trip: string, travelers: string): string | null {
  const kind = trip === "round" ? "Round trip" : trip === "oneway" ? "One way" : null;
  const parts = [kind, travelers.trim() || null].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * `Other great fares` (08): Home's offers to cities other than the one just requested, one per city, in Home's order —
 * six at most.
 */
export function otherFares(home: Pick<HomeVM, "sections"> | null, requestedTo: string, max = 6): ProposalCardVM[] {
  if (!home) return [];
  const seen = new Set<string>([requestedTo]);
  const out: ProposalCardVM[] = [];
  for (const section of home.sections) {
    for (const item of section.items) {
      if (seen.has(item.route.to)) continue;
      seen.add(item.route.to);
      out.push(item);
      if (out.length >= max) return out;
    }
  }
  return out;
}
