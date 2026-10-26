import { unreadQuotes } from "./request-view-logic";

/**
 * The Requests dot's number (DESIGN.md: 6 pt `accent-warm`), one for every tab bar — the tabs' own and the one on a
 * screen pushed over them. Plain module state, read through `useSyncExternalStore` (useUnreadQuotes.ts), so it is
 * tested without React Native.
 *
 * Every question for the list takes a ticket when it is asked — a tab bar's refresh, or the Requests screen's own
 * list. An answer shows only if its ticket is newer than the number on screen: the newest question wins, whichever
 * answer arrives first. A change of member moves past every ticket handed out before, so a member never sees the
 * number of the member signed in before.
 */

type Answer = { ok: true; data: { items: readonly { status: string }[] } } | { ok: false };

let count = 0;
/** Tickets handed out, one per question. */
let issued = 0;
/** The ticket of the number on screen. */
let shown = 0;
const listeners = new Set<() => void>();
let inFlight: { ticket: number; run: Promise<void> } | null = null;

function publish(n: number): void {
  count = n;
  for (const listener of listeners) listener();
}

function show(ticket: number, items: readonly { status: string }[]): void {
  if (ticket <= shown) return;
  shown = ticket;
  publish(unreadQuotes(items));
}

export function unreadQuotesCount(): number {
  return count;
}

export function subscribeUnreadQuotes(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A ticket for a question about to be asked: the Requests screen takes one before it asks for its list. */
export function askUnreadQuotes(): number {
  issued += 1;
  return issued;
}

/** The Requests screen already holds the list: it tells the dot without a second request to the server, with the
 *  ticket it took before asking. An answer to an older question than the number shown is dropped. */
export function noteUnreadQuotes(items: readonly { status: string }[], ticket: number = askUnreadQuotes()): void {
  show(ticket, items);
}

/**
 * Ask the server (`fetchList`: `fetchRequests` in the app), one question at a time however many tab bars ask — joined
 * only while it is still newer than the number shown. A failed answer keeps the last number; an answer to a question
 * older than the number shown, or asked before a change of member, is dropped.
 */
export function refreshUnreadQuotes(fetchList: () => Promise<Answer>): Promise<void> {
  if (inFlight && inFlight.ticket > shown) return inFlight.run;
  const ticket = askUnreadQuotes();
  const run: Promise<void> = (async () => {
    const result = await fetchList();
    if (result.ok) show(ticket, result.data.items);
  })().finally(() => {
    if (inFlight?.run === run) inFlight = null;
  });
  inFlight = { ticket, run };
  return run;
}

/** Sign-out, a deleted account, a new sign-in: the number is the next member's to fill. Every question asked before —
 *  a refresh still on its way, or the Requests screen's own list — is dropped when it answers. */
export function resetUnreadQuotes(): void {
  issued += 1;
  shown = issued;
  inFlight = null;
  publish(0);
}
