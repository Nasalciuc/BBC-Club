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
  phone_valid?: boolean;
  _actions?: { quoted: string; booked: string; closed: string };
};

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
      const text = [
        `New fare request ${p.reference}`,
        "",
        route,
        `${p.cabin_class} · ${p.trip_type} · ${p.passengers.adult} adult(s), ${p.passengers.child} child(ren), ${p.passengers.infant} infant(s)`,
        "",
        `Member: ${p.client.name}`,
        `Phone: ${p.client.phone}${p.phone_valid === false ? "  (not validated)" : ""}`,
        `Email: ${p.client.email}`,
        ...(p.note ? ["", `Note: ${p.note}`] : []),
        "",
        "When you have acted on it, mark it (each link asks you to confirm):",
        `Quote sent:  ${p._actions?.quoted ?? "-"}`,
        `Booked:      ${p._actions?.booked ?? "-"}`,
        `Closed:      ${p._actions?.closed ?? "-"}`,
      ].join("\n");
      await deps.email.sendOperatorRequest({
        to: deps.operatorsEmail,
        subject: `Request ${p.reference} · ${first?.from ?? ""}→${first?.to ?? ""} · ${p.cabin_class}`,
        text,
        replyTo: p.client.email,
      });
      return { crmRequestId: `email:${p.reference}` };
    },
  };
}
