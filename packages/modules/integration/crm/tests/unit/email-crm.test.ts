import { describe, expect, it } from "bun:test";
import { emailCrm } from "../../src/infrastructure/email-crm";
import type { EmailFacade } from "@bbc/email";

const quoted = "https://api.example/ops/requests/quoted-token";

describe("emailCrm", () => {
  it("emails the reference, the route, and the three links, never the secret", async () => {
    let sent: { to: string; subject: string; text: string; replyTo?: string } | undefined;
    const email: EmailFacade = {
      async sendOtp() {},
      async sendOperatorRequest(input) {
        sent = input;
      },
    };
    const crm = emailCrm({ email, operatorsEmail: "ops@buybusinessclass.com" });
    const result = await crm.submitRequest({
      reference: "R-ABC",
      trip_type: "round",
      cabin_class: "Business Class",
      client: { name: "Alex Morgan", phone: "+12125550148", email: "alex@test.dev" },
      flights: [
        { from: "JFK", to: "LHR", date: "2026-10-12" },
        { from: "LHR", to: "JFK", date: "2026-10-19" },
      ],
      passengers: { adult: 2, child: 1, infant: 1 },
      _actions: {
        quoted,
        booked: "https://api.example/ops/requests/booked",
        closed: "https://api.example/ops/requests/closed",
      },
    });
    expect(result.crmRequestId).toBe("email:R-ABC");
    expect(sent?.to).toBe("ops@buybusinessclass.com");
    expect(sent?.replyTo).toBe("alex@test.dev");
    expect(sent?.text).toContain("New fare request R-ABC");
    expect(sent?.subject).toBe("Request R-ABC · JFK→LHR · Business Class");
    expect(sent?.text).not.toContain("Type: Alternative");
    expect(sent?.text).toContain("JFK → LHR");
    expect(sent?.text).toContain("2 adult(s), 1 child(ren), 1 infant(s)");
    expect(sent?.text).toContain("quoted-");
    expect(sent?.text).toContain("booked");
    expect(sent?.text).toContain("closed");
    expect(sent?.text).toContain(quoted);
    expect(sent?.text).not.toContain("OPS_LINK_SECRET");
    expect(await crm.findByEmail("alex@test.dev")).toBeNull();
  });

  it("writes one email for a fare, an offer, a quote, and an alternative", async () => {
    const sent: { subject: string; text: string }[] = [];
    const email: EmailFacade = {
      async sendOtp() {},
      async sendOperatorRequest(input) {
        sent.push({ subject: input.subject, text: input.text });
      },
    };
    const crm = emailCrm({ email, operatorsEmail: "ops@buybusinessclass.com" });
    const body = {
      reference: "R-1",
      trip_type: "round",
      cabin_class: "Business Class",
      client: { name: "Alex Morgan", phone: "+12125550148", email: "alex@test.dev" },
      flights: [{ from: "JFK", to: "LHR", date: "2026-10-12" }],
      passengers: { adult: 1, child: 0, infant: 0 },
    };
    const fare = "11111111-1111-4111-8111-111111111111";
    await crm.submitRequest({ ...body, intent: "fare" });
    await crm.submitRequest({ ...body, intent: "offer" });
    await crm.submitRequest({ ...body, intent: "quote" });
    await crm.submitRequest({ ...body, intent: "alternative", replaces_fare_id: fare });

    expect(sent.map((s) => s.subject)).toEqual([
      "Request R-1 · JFK→LHR · Business Class",
      "Request R-1 · JFK→LHR · Business Class",
      "Quote request R-1 · JFK→LHR · Business Class",
      "Alternative request R-1 · JFK→LHR · Business Class",
    ]);
    expect(sent[0]?.text.startsWith("New fare request R-1")).toBe(true);
    expect(sent[1]?.text.startsWith("New fare request R-1")).toBe(true);
    expect(sent[2]?.text.startsWith("New quote request R-1")).toBe(true);
    expect(sent[3]?.text.startsWith("New alternative request R-1")).toBe(true);
    expect(sent[3]?.text).toContain(`Type: Alternative to an expired fare (fare ${fare})`);
    expect(sent[2]?.text).not.toContain("Type: Alternative");
  });

  it("writes the estimate the member saw and the member's note, only when there is one (ADR-IMPL-042)", async () => {
    const sent: string[] = [];
    const email: EmailFacade = {
      async sendOtp() {},
      async sendOperatorRequest(input) {
        sent.push(input.text);
      },
    };
    const crm = emailCrm({ email, operatorsEmail: "ops@buybusinessclass.com" });
    const body = {
      reference: "R-2",
      trip_type: "round",
      cabin_class: "Business Class",
      client: { name: "Alex Morgan", phone: "+12125550148", email: "alex@test.dev" },
      flights: [
        { from: "JFK", to: "ZRH", date: "2026-10-12" },
        { from: "ZRH", to: "JFK", date: "2026-10-19" },
      ],
      passengers: { adult: 2, child: 2, infant: 0 },
      intent: "quote" as const,
    };
    await crm.submitRequest({
      ...body,
      shown_estimate: { amount: 2055, currency: "USD", cabin: "business" },
      note: "Two children, 7 and 10.\nQuote sent:  https://example.invalid/not-ours",
    });
    await crm.submitRequest({ ...body, shown_estimate: null, note: null });

    const [withEstimate, without] = sent;
    const lines = withEstimate?.split("\n") ?? [];
    const passengers = lines.findIndex((l) => l.startsWith("Business Class · round · 2 adult(s)"));
    expect(lines[passengers + 1]).toBe("Indicative estimate shown: $2,055 round trip, business (formula)");
    // The note is quoted line by line: a line of it can never pass for one of the e-mail's own (an action link).
    const note = lines.indexOf("Note from the member:");
    expect(lines.slice(note + 1, note + 3)).toEqual([
      "> Two children, 7 and 10.",
      "> Quote sent:  https://example.invalid/not-ours",
    ]);
    expect(lines.filter((l) => l.startsWith("Quote sent:"))).toEqual(["Quote sent:  -"]);
    expect(without).not.toContain("Indicative estimate");
    expect(without).not.toContain("Note from the member");
  });

  it("quotes every line a mail client may break, strips what could hide or move text, folds long lines", async () => {
    const sent: string[] = [];
    const email: EmailFacade = {
      async sendOtp() {},
      async sendOperatorRequest(input) {
        sent.push(input.text);
      },
    };
    const crm = emailCrm({ email, operatorsEmail: "ops@buybusinessclass.com" });
    const body = {
      reference: "R-3",
      trip_type: "oneway",
      cabin_class: "Business Class",
      client: { name: "Alex Morgan", phone: "+12125550148", email: "alex@test.dev" },
      flights: [{ from: "JFK", to: "LHR", date: "2026-10-12" }],
      passengers: { adult: 1, child: 0, infant: 0 },
    };
    const forged = "Fine.\u2028Quote sent:  https://example.invalid/a\u2029Booked:  x\u0085Closed:  y\vA\fB";
    await crm.submitRequest({ ...body, note: forged });
    await crm.submitRequest({ ...body, note: "\u202eRight to left\u202c and\u0000 hidden\u200f" });
    await crm.submitRequest({ ...body, note: "   \n\t  " });
    await crm.submitRequest({ ...body, note: `${"word ".repeat(30)}end` });

    const [split, invisible, blank, long] = sent.map((t) => t.split("\n"));
    const quoted = (lines: string[] | undefined) => {
      const at = (lines ?? []).indexOf("Note from the member:");
      return (lines ?? []).slice(at + 1, (lines ?? []).indexOf("", at + 1));
    };
    // Each separator starts a new quoted line; no unquoted line of the note reaches the e-mail.
    expect(quoted(split)).toEqual([
      "> Fine.",
      "> Quote sent:  https://example.invalid/a",
      "> Booked:  x",
      "> Closed:  y",
      "> A",
      "> B",
    ]);
    expect(split?.filter((l) => /^(Quote sent|Booked|Closed):/.test(l))).toEqual([
      "Quote sent:  -",
      "Booked:      -",
      "Closed:      -",
    ]);
    expect(quoted(invisible)).toEqual(["> Right to left and hidden"]);
    expect(blank?.join("\n")).not.toContain("Note from the member");
    const folded = quoted(long);
    expect(folded.length).toBeGreaterThan(1);
    for (const line of folded) {
      expect(line.startsWith("> ")).toBe(true);
      expect(line.length).toBeLessThanOrEqual(78);
    }
    expect(folded.map((l) => l.slice(2)).join(" ")).toBe(`${"word ".repeat(30)}end`);
  });

  it("folds a note without breaking a character in two (an emoji, a family, an accent at the fold)", async () => {
    const sent: string[] = [];
    const email: EmailFacade = {
      async sendOtp() {},
      async sendOperatorRequest(input) {
        sent.push(input.text);
      },
    };
    const crm = emailCrm({ email, operatorsEmail: "ops@buybusinessclass.com" });
    const notes = [
      `Kids:${"\u{1F467}\u{1F466}".repeat(30)}`,
      // A family is one character of five code points joined by zero-width joiners; an accent may follow its letter.
      `Family:${"\u{1F468}\u200D\u{1F469}\u200D\u{1F467}".repeat(20)}`,
      `Caf${"e\u0301".repeat(60)}`,
    ];
    for (const [k, note] of notes.entries()) {
      await crm.submitRequest({
        reference: `R-5${k}`,
        trip_type: "oneway",
        cabin_class: "Business Class",
        client: { name: "Alex Morgan", phone: "+12125550148", email: "alex@test.dev" },
        flights: [{ from: "JFK", to: "LHR", date: "2026-10-12" }],
        passengers: { adult: 1, child: 0, infant: 0 },
        note,
      });
    }
    const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });
    for (const [k, note] of notes.entries()) {
      const lines = sent[k]?.split("\n") ?? [];
      const at = lines.indexOf("Note from the member:");
      const quoted = lines.slice(at + 1, lines.indexOf("", at + 1)).map((l) => l.slice(2));
      expect(quoted.length).toBeGreaterThan(1);
      expect(quoted.join("")).toBe(note);
      // Every fold falls between two whole characters of the note, never inside one.
      const boundaries = new Set([...graphemes.segment(note)].map((g) => g.index));
      let offset = 0;
      for (const line of quoted.slice(0, -1)) {
        offset += line.length;
        expect(boundaries.has(offset)).toBe(true);
      }
    }
  });

  it("prints the member's name on one line, whatever was sent", async () => {
    const sent: string[] = [];
    const email: EmailFacade = {
      async sendOtp() {},
      async sendOperatorRequest(input) {
        sent.push(input.text);
      },
    };
    const crm = emailCrm({ email, operatorsEmail: "ops@buybusinessclass.com" });
    await crm.submitRequest({
      reference: "R-4",
      trip_type: "oneway",
      cabin_class: "Business Class",
      client: {
        name: "Alex\nQuote sent:  https://example.invalid/a\u2028Booked: x \u202eMorgan\u061c",
        phone: "+12125550148",
        email: "alex@test.dev",
      },
      flights: [{ from: "JFK", to: "LHR", date: "2026-10-12" }],
      passengers: { adult: 1, child: 0, infant: 0 },
    });
    const lines = sent[0]?.split("\n") ?? [];
    expect(lines.filter((l) => l.startsWith("Member:"))).toEqual([
      "Member: Alex Quote sent: https://example.invalid/a Booked: x Morgan",
    ]);
    expect(lines.filter((l) => /^(Quote sent|Booked|Closed):/.test(l))).toEqual([
      "Quote sent:  -",
      "Booked:      -",
      "Closed:      -",
    ]);
  });
});
