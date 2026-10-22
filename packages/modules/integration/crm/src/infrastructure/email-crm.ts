import type { CrmFacade, CrmMoney, CrmRequestPayload } from "../api";
import type { EmailFacade } from "@bbc/email";

type Payload = CrmRequestPayload;

function opening(p: Payload): string {
  if (p.intent === "quote") return `New quote request ${p.reference}`;
  if (p.intent === "alternative") return `New alternative request ${p.reference}`;
  if (p.intent === "offer") return `New offer request ${p.reference}`;
  return `New fare request ${p.reference}`;
}

/** `$4,200` — whole units, as the app shows a fare. */
function money(m: CrmMoney): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: m.currency, maximumFractionDigits: 0 }).format(
      m.amount,
    );
  } catch {
    return `${m.currency} ${m.amount}`;
  }
}

/** `Indicative estimate shown: $2,055 round trip, business (formula)` — the wording approved with ADR-IMPL-037. */
function estimateLine(e: NonNullable<Payload["shown_estimate"]>): string {
  return `Indicative estimate shown: ${money(e)} round trip, ${e.cabin} (formula)`;
}

/** `Fare <id> — British Airways — $4,200 (published $7,850, Sabre · 16 Sep)`: which fare, on which airline, at the price
 *  the member saw beside the published one they were shown. Only what the request recorded. */
function fareLine(p: Payload): string | null {
  if (!p.fare_id) return null;
  const parts = [`Fare ${p.fare_id}`];
  if (p.carrier) parts.push(oneLine(p.carrier.name));
  if (p.price_at_request) {
    const published = p.published_at_request
      ? ` (published ${money({ amount: p.published_at_request.amount, currency: p.price_at_request.currency })}, ${oneLine(p.published_at_request.source)})`
      : "";
    parts.push(`${money(p.price_at_request)}${published}`);
  }
  return parts.join(" — ");
}

/** `Offer Your October in London — <id> — $3,900`: the offer as it reads when the request is sent. */
function offerLine(p: Payload): string | null {
  if (p.offer) return `Offer ${oneLine(p.offer.title)} — ${p.offer.id} — ${money(p.offer.price)}`;
  return p.offer_id ? `Offer ${p.offer_id}` : null;
}

/** Every break a mail client may honour: CR LF, LF, CR, VT, FF, NEL, LINE and PARAGRAPH SEPARATOR. */
const LINE_BREAK = /\r\n|[\n\r\v\f\u0085\u2028\u2029]/;
/** The other control characters, and the bidirectional marks, overrides and isolates: they could hide text or move
 *  a line's "> " to its far end. */
const INVISIBLE = /[\u0000-\u0008\u000e-\u001f\u007f-\u0084\u0086-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
/** A quoted line longer than this is folded by the sender, so a mail client rarely has to wrap it (ADR-IMPL-042). */
const QUOTE_WIDTH = 76;
const GRAPHEMES = new Intl.Segmenter("en", { granularity: "grapheme" });

/** Where to cut a line with no space to cut at: after the last whole character that fits — an emoji (a family, a flag)
 *  or a letter with its accent is never split across two quoted lines; past `at` only when one character is longer. */
function cutAt(text: string, at: number): number {
  let cut = 0;
  for (const { index, segment } of GRAPHEMES.segment(text)) {
    const end = index + segment.length;
    if (end > at) return cut > 0 ? cut : end;
    cut = end;
  }
  return cut;
}

function fold(line: string): string[] {
  const out: string[] = [];
  let rest = line;
  while (rest.length > QUOTE_WIDTH) {
    const space = rest.lastIndexOf(" ", QUOTE_WIDTH);
    const cut = space > QUOTE_WIDTH / 2 ? space : cutAt(rest, QUOTE_WIDTH);
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  out.push(rest);
  return out;
}

/** A field the member typed that the e-mail prints on its own line (the name): one line, whatever was sent, so it
 *  cannot start a line of its own — an action link above all. */
function oneLine(text: string): string {
  return text.replace(INVISIBLE, "").split(LINE_BREAK).join(" ").replace(/\s+/g, " ").trim();
}

/** The member's own words, quoted line by line under a heading: no line of a note can pass for a line of this e-mail —
 *  an action link above all (ADR-IMPL-042). Null when there is nothing to quote. */
function noteLines(note: string | null | undefined): string[] | null {
  const clean = (note ?? "").replace(INVISIBLE, "");
  if (!clean.trim()) return null;
  const lines = clean.trim().split(LINE_BREAK).flatMap(fold);
  return ["Note from the member:", ...lines.map((line) => `> ${line}`.trimEnd())];
}

function subjectFor(p: Payload, hop: string): string {
  const tail = `${p.reference} · ${hop} · ${p.cabin_class}`;
  if (p.intent === "quote") return `Quote request ${tail}`;
  if (p.intent === "alternative") return `Alternative request ${tail}`;
  return `Request ${tail}`;
}

export function emailCrm(deps: { email: EmailFacade; operatorsEmail: string }): CrmFacade {
  return {
    async findByEmail() {
      return null;
    },
    async createActivity() {
      return { id: null };
    },
    async submitRequest(raw) {
      const p = raw as Payload;
      const route = p.flights.map((f) => `${f.from} → ${f.to}  ${f.date}`).join("\n");
      const note = noteLines(p.note);
      const first = p.flights[0];
      const hop = `${first?.from ?? ""}→${first?.to ?? ""}`;
      const fare = fareLine(p);
      const offer = offerLine(p);
      const text = [
        opening(p),
        ...(p.intent === "alternative" && p.replaces_fare_id
          ? ["", `Type: Alternative to an expired fare (fare ${p.replaces_fare_id})`]
          : []),
        ...(fare ? ["", fare] : []),
        ...(offer ? ["", offer] : []),
        "",
        route,
        `${p.cabin_class} · ${p.trip_type} · ${p.passengers.adult} adult(s), ${p.passengers.child} child(ren), ${p.passengers.infant} infant(s)`,
        ...(p.shown_estimate ? [estimateLine(p.shown_estimate)] : []),
        "",
        `Member: ${oneLine(p.client.name)}`,
        `Phone: ${p.client.phone}${p.phone_valid === false ? "  (not validated)" : ""}`,
        `Email: ${p.client.email}`,
        ...(note ? ["", ...note] : []),
        "",
        "When you have acted on it, mark it (each link asks you to confirm):",
        `Quote sent:  ${p._actions?.quoted ?? "-"}`,
        `Booked:      ${p._actions?.booked ?? "-"}`,
        `Closed:      ${p._actions?.closed ?? "-"}`,
      ].join("\n");
      await deps.email.sendOperatorRequest({
        to: deps.operatorsEmail,
        subject: subjectFor(p, hop),
        text,
        replyTo: p.client.email,
      });
      return { crmRequestId: `email:${p.reference}` };
    },
  };
}
