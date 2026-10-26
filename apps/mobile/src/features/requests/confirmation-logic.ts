import type { HomeVM } from "@bbc/shared/api/v1/fares";
import type { ProposalCardVM } from "@bbc/shared/api/v1/proposals";

/** Which confirmation the member sees after a request: an offer's or a search's (08), or the one saved offline (26). */
export type RequestSource = "offer" | "search";
export type ConfirmationKind = "offer" | "search" | "saved";
export function confirmationKind(source: RequestSource, queuedOffline: boolean): ConfirmationKind {
  return queuedOffline ? "saved" : source;
}

/**
 * The saved page's words (26). Offline, it says so; kept because the club's server did not answer while the phone is
 * online (a timeout, DNS, the server down), it never says "offline" (F110). The title stays within 26's two lines.
 */
export function savedCopy(unreachable: boolean): { title: string; body: string } {
  const after = "Nothing more to do — a specialist will call you shortly after it arrives.";
  return unreachable
    ? { title: "Saved. It goes out when the club answers.", body: `We can’t reach the club right now. ${after}` }
    : { title: "Saved. It goes out when you’re back online.", body: `You’re offline right now. ${after}` };
}

/** Minutes to show on the "too many requests" screen (frame 481:9061). Retry-After is seconds; never show 0 or a fraction. */
export function retryMinutes(retryAfterS: number | undefined): number {
  if (retryAfterS === undefined || !Number.isFinite(retryAfterS) || retryAfterS <= 0) return 1;
  return Math.max(1, Math.ceil(retryAfterS / 60));
}

/** Which limit refused a request (the 429's `error.context.scope`, g5): the address's — shared with whoever is behind
 *  it — or the member's own; null when the server does not say (an older one) or says something this app does not know. */
export function limitScope(context: unknown): "ip" | "member" | null {
  const scope = context && typeof context === "object" ? (context as { scope?: unknown }).scope : undefined;
  return scope === "ip" || scope === "member" ? scope : null;
}

/**
 * The rate-limit page's words (27): the member's own limit says they sent several and their specialist has the others;
 * any other — an address shared with others, or a server that does not say — is neutral: the member may have sent
 * nothing (F086).
 */
export function limitedCopy(s: { scope?: "ip" | "member" | null; minutes: number; canCall: boolean }): {
  title: string;
  body: string;
} {
  const when = `${s.minutes} ${s.minutes === 1 ? "minute" : "minutes"}`;
  if (s.scope === "member") {
    return {
      title: "You’ve sent several requests this hour.",
      body: `You can send another in ${when}. Your specialist already has the others.`,
    };
  }
  return {
    title: "We couldn’t take this request just now.",
    body: `Try again in ${when}${s.canCall ? ", or call your specialist" : ""}.`,
  };
}

/** `RequestBody.contact.name` takes 2–80 characters (the profile allows 120): the field stops at 80. */
export const REQUEST_NAME_MAX = 80;

/**
 * Why a request's details cannot go, in the sheet's own words — the first problem only, calmly, with what to do
 * (DESIGN.md, Product Content). Checked before a request is sent or saved on the phone: a request saved with details
 * the server refuses could never leave it.
 */
export function bodyProblem(
  issues: readonly { path: readonly (string | number)[]; message: string }[],
  /** What was checked: the name's own length tells an empty name from a short or a long one. */
  body?: { contact?: { name?: string } },
): string | null {
  const first = issues[0];
  if (!first) return null;
  const where = first.path.join(".");
  if (where === "contact.name") {
    const name = body?.contact?.name?.trim() ?? "";
    if (name.length > REQUEST_NAME_MAX) return `Shorten the name to ${REQUEST_NAME_MAX} characters.`;
    if (name.length > 0) return "Use your full name.";
    return "Add your name, so your specialist knows who to ask for.";
  }
  if (where === "contact.email") return "Add an email address we can write to.";
  if (where === "contact.phone") return first.message;
  if (where === "note") return "Keep the note under 500 characters.";
  // A trip the server cannot take (g5-impossible-trips): the route, the dates, the travelers or the fare.
  if (/^legs\.\d+\.(from|to)$/.test(where)) return "Choose a destination other than where the flight leaves from.";
  if (where.startsWith("legs"))
    return "Check your dates: a day from today on, and the return on or after the departure.";
  if (where === "passengers.infant") return "Each infant travels on an adult’s lap. Add an adult, or remove an infant.";
  if (where.startsWith("passengers")) return "Check the travelers and try again.";
  if (where === "fareId") return "This fare can’t be requested any more. Ask for a quote on the route instead.";
  if (where === "offerId") return "This offer can’t be requested any more. Ask for a quote on the route instead.";
  return first.message;
}

/** `Round trip`, `1 adult` (08, drawn with a dot between): the trip and the travelers the request asked for. */
export function tripFacts(trip: string, travelers: string): string[] {
  const kind = trip === "round" ? "Round trip" : trip === "oneway" ? "One way" : null;
  return [kind, travelers.trim() || null].filter((part): part is string => part !== null);
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
