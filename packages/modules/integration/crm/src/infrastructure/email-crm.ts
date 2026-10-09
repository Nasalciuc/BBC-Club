import type { CrmFacade } from "../api";
import type { EmailFacade } from "@bbc/email";

type Payload = {
  reference: string;
  trip_type: string;
  cabin_class: string;
  client: { name: string; phone: string; email: string };
  flights: { from: string; to: string; date: string }[];
  passengers: { adult: number; child: number; infant: number };
  note?: string | null;
  /** The indicative price the member's search showed, recomputed by the server (ADR-IMPL-042). Round trip. */
  shown_estimate?: { amount: number; currency: string; cabin: string } | null;
  phone_valid?: boolean;
  intent?: "quote" | "alternative" | "fare" | "offer";
  replaces_fare_id?: string | null;
  _actions?: { quoted: string; booked: string; closed: string };
};

function opening(p: Payload): string {
  if (p.intent === "quote") return `New quote request ${p.reference}`;
  if (p.intent === "alternative") return `New alternative request ${p.reference}`;
  return `New fare request ${p.reference}`;
}

/** `Indicative estimate shown: $2,055 round trip, business (formula)` — the wording approved with ADR-IMPL-037. */
function estimateLine(e: NonNullable<Payload["shown_estimate"]>): string {
  let amount: string;
  try {
    amount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: e.currency,
      maximumFractionDigits: 0,
    }).format(e.amount);
  } catch {
    amount = `${e.currency} ${e.amount}`;
  }
  return `Indicative estimate shown: ${amount} round trip, ${e.cabin} (formula)`;
}

/** The member's own words, quoted line by line under a heading: a note can never pass for a line of this e-mail — an
 *  action link above all (ADR-IMPL-042). */
function noteLines(note: string): string[] {
  return ["Note from the member:", ...note.split(/\r\n|\r|\n/).map((line) => `> ${line}`)];
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
      const first = p.flights[0];
      const hop = `${first?.from ?? ""}→${first?.to ?? ""}`;
      const text = [
        opening(p),
        ...(p.intent === "alternative" && p.replaces_fare_id
          ? ["", `Type: Alternative to an expired fare (fare ${p.replaces_fare_id})`]
          : []),
        "",
        route,
        `${p.cabin_class} · ${p.trip_type} · ${p.passengers.adult} adult(s), ${p.passengers.child} child(ren), ${p.passengers.infant} infant(s)`,
        ...(p.shown_estimate ? [estimateLine(p.shown_estimate)] : []),
        "",
        `Member: ${p.client.name}`,
        `Phone: ${p.client.phone}${p.phone_valid === false ? "  (not validated)" : ""}`,
        `Email: ${p.client.email}`,
        ...(p.note ? ["", ...noteLines(p.note)] : []),
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
