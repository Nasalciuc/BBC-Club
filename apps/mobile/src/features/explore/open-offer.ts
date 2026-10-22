import type { Href } from "expo-router";
import type { ProposalCardVM } from "@bbc/shared/api/v1/proposals";

/** The search a fare was found by (05's chips and `About this fare`): its days and its travelers. */
export type FareSearch = {
  depart: string | null;
  return: string | null;
  passengers: { adult: number; child: number; infant: number };
};

/** A fare's page; from a search, with the days and travelers it was searched for (05). */
export function fareHref(id: string, offerId?: string | null, search?: FareSearch | null): Href {
  const params: Record<string, string> = { id };
  if (offerId) params.offerId = offerId;
  if (search) {
    if (search.depart) params.depart = search.depart;
    if (search.depart && search.return) params.ret = search.return;
    params.adults = String(search.passengers.adult);
    if (search.passengers.child) params.children = String(search.passengers.child);
    if (search.passengers.infant) params.infants = String(search.passengers.infant);
  }
  return { pathname: "/fare/[id]", params } as unknown as Href;
}

/**
 * An offer's own page (F067): the fare page in its offer mode, driven by GET /v1/proposals/:id — the offer's price,
 * validity, picture and facts, never a catalogue fare's. Its route and cabin ride along (codes only) so a closed offer
 * can still offer an alternative on the same route.
 */
export function offerHref(card: Pick<ProposalCardVM, "id" | "route" | "cabin">): Href {
  return {
    pathname: "/fare/[id]",
    params: { id: card.id, kind: "offer", from: card.route.from, to: card.route.to, cabin: card.cabin },
  } as unknown as Href;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const IATA = /^[A-Z]{3}$/;

/** The offer's page params back: null when the page is a fare's. Only codes and a cabin this app knows are read. */
export function offerFromParams(p: Record<string, string | string[] | undefined>): {
  id: string;
  from: string | null;
  to: string | null;
  cabin: "business" | "first" | null;
} | null {
  const id = one(p.id);
  if (one(p.kind) !== "offer" || !id) return null;
  const code = (v: string | undefined) => (v && IATA.test(v) ? v : null);
  const cabin = one(p.cabin);
  return {
    id,
    from: code(one(p.from)),
    to: code(one(p.to)),
    cabin: cabin === "business" || cabin === "first" ? cabin : null,
  };
}

/**
 * One navigation from a card at a time (F101): a second tap while the first is still in progress is ignored. A
 * promise holds the guard until it settles; a push holds it until the screen is focused again (`release`) — or, should
 * the push never take the screen away, for `holdMs`.
 */
export function createTapGuard(opts: { holdMs?: number; now?: () => number } = {}) {
  const holdMs = opts.holdMs ?? 1000;
  const now = opts.now ?? Date.now;
  let since: number | null = null;
  let pending: Promise<unknown> | null = null;
  const busy = () => pending !== null || (since !== null && now() - since < holdMs);
  return {
    run(go: () => unknown): boolean {
      if (busy()) return false;
      since = now();
      let result: unknown;
      try {
        result = go();
      } catch (e) {
        since = null;
        throw e;
      }
      if (result instanceof Promise) {
        const run = result;
        pending = run;
        run
          .catch(() => undefined)
          .finally(() => {
            if (pending !== run) return;
            pending = null;
            since = null;
          })
          .catch(() => undefined);
      }
      return true;
    },
    /** The screen is in view again: the next tap navigates. */
    release(): void {
      since = null;
      pending = null;
    },
  };
}

export type TapGuard = ReturnType<typeof createTapGuard>;

/** The tap on an offer card: its own page, pushed at once — nothing is awaited first (F067, F101). */
export function openOffer(
  router: { push: (href: Href) => void },
  card: Pick<ProposalCardVM, "id" | "route" | "cabin">,
  guard: TapGuard,
): boolean {
  return guard.run(() => router.push(offerHref(card)));
}
