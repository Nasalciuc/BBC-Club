import { describe, expect, it } from "bun:test";
import { RequestBody } from "@bbc/shared/api/v1/requests";
import { fixture } from "@bbc/shared/fixture";

import {
  buildDraft,
  defaultDates,
  draftToBody,
  legsForTripType,
  missingReturn,
  requestDraftReducer,
} from "./useRequestDraft";

/** Runtime today: a fixed calendar day eventually falls before `earliestLegDay` and flunks a body that ships. */
const TODAY = new Date().toISOString().slice(0, 10);
const inDays = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const CONTACT = { name: "Ada Lovelace", phone: "+12125550148", email: "ada@example.com" };

describe("the sheet's notice never outlives its cause (F099)", () => {
  const failed = {
    ...buildDraft({ mode: "quote", today: TODAY }),
    submitError: "Add an email address we can write to.",
  };

  it("any change to the draft takes the old 'This request didn't send' notice away", () => {
    const changes = [
      { type: "setContact", field: "email", value: "ada@example.com" },
      { type: "setContact", field: "name", value: "Ada" },
      { type: "setNote", note: "Window seat" },
      { type: "setTripType", tripType: "oneway" },
      { type: "setDepart", date: "2026-11-03" },
      { type: "setReturn", date: "2026-11-10" },
      { type: "setPassengers", passengers: { adult: 2, child: 0, infant: 0 } },
    ] as const;
    for (const action of changes) {
      expect(requestDraftReducer(failed, action).submitError).toBeNull();
    }
  });

  it("an error of a field's own stays until that field changes", () => {
    const state = { ...failed, phoneError: "That phone number doesn't look right." };
    expect(requestDraftReducer(state, { type: "setNote", note: "x" }).phoneError).toBe(state.phoneError);
    expect(requestDraftReducer(state, { type: "setContact", field: "phone", value: "+1" }).phoneError).toBeNull();
  });
});

describe("buildDraft — dates", () => {
  it("suggests two weeks out and a week long when nothing was chosen — never a fixed day", () => {
    const suggested = defaultDates(TODAY);
    expect(defaultDates(TODAY)).toEqual(suggested);
    const draft = buildDraft({ mode: "quote", fromCode: "JFK", toCode: "LHR", today: TODAY });
    expect(draft.tripType).toBe("round");
    expect(draft.legs.map((l) => l.date)).toEqual([suggested.depart, suggested.ret]);
    // The old fixture (12–19 Oct 2026) is gone: a year later the suggestion still lies ahead.
    expect(buildDraft({ mode: "quote", today: "2027-10-08" }).legs[0]?.date).toBe("2027-10-22");
  });

  it("carries the dates chosen on Home, round trip or one way", () => {
    const depart = inDays(30);
    const back = inDays(37);
    const round = buildDraft({
      mode: "quote",
      today: TODAY,
      search: {
        dates: { depart, return: back, flexible: false },
        cabin: "business",
        passengers: { adult: 1, child: 0, infant: 0 },
      },
    });
    expect(round.tripType).toBe("round");
    expect(round.legs.map((l) => l.date)).toEqual([depart, back]);

    const oneWay = buildDraft({
      mode: "quote",
      today: TODAY,
      search: {
        dates: { depart, return: null, flexible: false },
        cabin: "business",
        passengers: { adult: 1, child: 0, infant: 0 },
      },
    });
    expect(oneWay.tripType).toBe("oneway");
    expect(draftToBody(oneWay).legs).toHaveLength(1);
    expect(oneWay.legs[0]?.date).toBe(depart);
    // No return was chosen: none is invented for a later switch to Round trip.
    expect(oneWay.legs[1]?.date).toBe("");
  });
});

describe("buildDraft — an offer is requested as the offer, at its own price (F067, F096)", () => {
  const offer = {
    id: "6c23904e-b0c6-45e3-8da8-81138445551a",
    route: { from: "KEF", to: "CDG" },
    cabin: "business" as const,
    price: { offer: 1700, published: 2400, publishedSource: "Sabre · 16 Sep", currency: "USD" },
  };

  it("sends offerId and the offer's price — never a catalogue fare's id or price", () => {
    const draft = buildDraft({ offer, today: TODAY });
    expect(draft.mode).toBe("offer");
    const body = draftToBody({ ...draft, contact: CONTACT });
    expect(body.offerId).toBe(offer.id);
    expect(body).not.toHaveProperty("fareId");
    expect(body.fareId).toBeUndefined();
    expect(body.intent).toBeUndefined();
    expect(body.priceAtRequest).toBe(1700);
    expect(body.cabin).toBe("business");
    expect(body.legs[0]).toMatchObject({ from: "KEF", to: "CDG" });
    expect(RequestBody.safeParse(body).success).toBe(true);
  });

  it("the offer wins over a fare passed beside it: its id and its price, never both", () => {
    const fare = { ...fixture.fares[0]!, price: { offer: 1900.5, currency: "USD" } };
    const body = draftToBody({ ...buildDraft({ offer, fare, today: TODAY }), contact: CONTACT });
    expect(body.offerId).toBe(offer.id);
    expect(body.fareId).toBeUndefined();
    expect(body.priceAtRequest).toBe(1700);
    expect(RequestBody.safeParse(body).success).toBe(true);
  });
});

describe("buildDraft — never a day that has passed (F006)", () => {
  it("a remembered departure before today gives way to the suggestion", () => {
    const draft = buildDraft({
      mode: "quote",
      fromCode: "JFK",
      toCode: "LHR",
      today: "2026-10-20",
      search: {
        dates: { depart: "2026-10-05", return: "2026-10-12", flexible: false },
        cabin: "business",
        passengers: { adult: 1, child: 0, infant: 0 },
      },
    });
    expect(draft.tripType).toBe("round");
    expect(draft.legs.map((l) => l.date)).toEqual(["2026-11-03", "2026-11-10"]);
  });

  it("a fare's own day that has passed gives way too", () => {
    const fare = { ...fixture.fares[0]!, departDate: "2026-10-05", trip: "one_way" as const };
    expect(buildDraft({ fare, today: "2026-10-20" }).legs[0]?.date).toBe("2026-11-03");
  });
});

describe("buildDraft — a fare's own day and trip (F097)", () => {
  const fa01 = {
    ...fixture.fares[0]!,
    departAt: "2026-11-10T23:55:00.000Z",
    departLocal: "18:55",
    departDate: "2026-11-10",
    trip: "one_way" as const,
  };

  it("requests a one-way fare on the day it leaves, one way, at its price — never two weeks out round trip", () => {
    const draft = buildDraft({ fare: fa01, today: TODAY });
    expect(draft.tripType).toBe("oneway");
    const body = draftToBody({ ...draft, contact: CONTACT });
    expect(body.legs).toEqual([{ from: "JFK", to: "LHR", date: "2026-11-10" }]);
    expect(body.priceAtRequest).toBe(4200);
    expect(body.fareId).toBe(fa01.id);
    expect(RequestBody.safeParse(body).success).toBe(true);
  });

  it("requests a round-trip fare from its day, the return a week later — still the member's to change", () => {
    const draft = buildDraft({ fare: { ...fa01, trip: "round_trip" }, today: TODAY });
    expect(draft.tripType).toBe("round");
    expect(draft.legs).toEqual([
      { from: "JFK", to: "LHR", date: "2026-11-10" },
      { from: "LHR", to: "JFK", date: "2026-11-17" },
    ]);
  });

  it("the fare's own day wins over a searched one (the page prints the fare's day)", () => {
    const search = {
      dates: { depart: "2026-11-03", return: "2026-11-20", flexible: false },
      cabin: "business" as const,
      passengers: { adult: 1, child: 0, infant: 0 },
    };
    expect(buildDraft({ fare: fa01, search, today: TODAY }).legs[0]?.date).toBe("2026-11-10");
    // A round-trip fare keeps the searched return when it comes after the fare's day.
    const round = buildDraft({ fare: { ...fa01, trip: "round_trip" }, search, today: TODAY });
    expect(round.legs.map((l) => l.date)).toEqual(["2026-11-10", "2026-11-20"]);
  });

  it("a fare without a day of its own keeps the suggestion, but takes its trip from the fare", () => {
    const undated = { ...fa01, departAt: null, departLocal: null, departDate: null };
    const suggested = defaultDates(TODAY);
    const oneWay = buildDraft({ fare: undated, today: TODAY });
    expect(oneWay.tripType).toBe("oneway");
    expect(oneWay.legs[0]?.date).toBe(suggested.depart);
    const round = buildDraft({ fare: { ...undated, trip: "round_trip" }, today: TODAY });
    expect(round.tripType).toBe("round");
    expect(round.legs.map((l) => l.date)).toEqual([suggested.depart, suggested.ret]);
  });
});

describe("legsForTripType — One way and back", () => {
  const out = { from: "JFK", to: "LHR", date: "2026-11-03" };
  const back = { from: "LHR", to: "JFK", date: "2026-11-10" };

  it("One way keeps the outbound only", () => {
    expect(legsForTripType([out, back], "oneway")).toEqual([out]);
  });

  it("back to Round trip, the return has no date — the sheet asks for one (Figma 135:851)", () => {
    const legs = legsForTripType(legsForTripType([out, back], "oneway"), "round");
    expect(legs).toEqual([out, { from: "LHR", to: "JFK", date: "" }]);
    expect(missingReturn("round", legs[1]?.date)).toBe(true);
  });

  it("a round trip that has its return keeps it", () => {
    expect(legsForTripType([out, back], "round")).toEqual([out, back]);
  });

  it("a one-way search switched to Round trip asks for the return", () => {
    const draft = buildDraft({
      mode: "quote",
      today: TODAY,
      search: {
        dates: { depart: "2026-11-03", return: null, flexible: false },
        cabin: "business",
        passengers: { adult: 1, child: 0, infant: 0 },
      },
    });
    const legs = legsForTripType(draft.legs, "round");
    expect(legs[1]?.date).toBe("");
    expect(missingReturn("round", legs[1]?.date)).toBe(true);
  });
});

describe("buildDraft — cabin and travelers", () => {
  const profile = {
    preferences: { cabin: "first", passengers: { adult: 2, child: 0, infant: 0 } },
  } as unknown as NonNullable<Parameters<typeof buildDraft>[0]["profile"]>;

  it("takes the profile's usual cabin and travelers when Home chose nothing", () => {
    const draft = buildDraft({ mode: "quote", profile, today: TODAY });
    expect(draft.cabin).toBe("first");
    expect(draft.passengers).toEqual({ adult: 2, child: 0, infant: 0 });
  });

  it("prefers what was chosen for this search, and a fare's cabin above both", () => {
    const search = {
      dates: { depart: null, return: null, flexible: true },
      cabin: "business" as const,
      passengers: { adult: 3, child: 0, infant: 0 },
    };
    const fromSearch = buildDraft({ mode: "quote", profile, search, today: TODAY });
    expect(fromSearch.cabin).toBe("business");
    expect(fromSearch.passengers.adult).toBe(3);
    // Flexible dates keep the suggestion.
    const suggested = defaultDates(TODAY);
    expect(fromSearch.legs.map((l) => l.date)).toEqual([suggested.depart, suggested.ret]);

    const fare = { cabin: "first", from: { code: "JFK" }, to: { code: "LHR" }, offerId: null, price: { offer: 1 } };
    const fromFare = buildDraft({ fare: fare as never, profile, search, today: TODAY });
    expect(fromFare.cabin).toBe("first");
  });

  it("starts a profile name longer than a request takes within the field's 80 characters (F100)", () => {
    const long = { ...profile, displayName: "B".repeat(120) } as typeof profile;
    expect(buildDraft({ mode: "quote", profile: long, today: TODAY }).contact.name).toHaveLength(80);
  });

  it("falls back to business and one adult with no profile and no search", () => {
    const draft = buildDraft({ mode: "quote", today: TODAY });
    expect(draft.cabin).toBe("business");
    expect(draft.passengers).toEqual({ adult: 1, child: 0, infant: 0 });
  });
});

describe("estimateShown — a yes only for what the member saw (ADR-IMPL-042)", () => {
  it("a quote opened over the indicative fare says so; the server recomputes the number", () => {
    const draft = buildDraft({ mode: "quote", fromCode: "JFK", toCode: "ZRH", estimateShown: true, today: TODAY });
    expect(draft.estimateFor).toEqual({ from: "JFK", to: "ZRH", cabin: "business" });
    const body = draftToBody(draft);
    expect(body.estimateShown).toBe(true);
    expect(body).not.toHaveProperty("estimate");
  });

  it("no estimate on screen, no yes — and never for a fare, an offer or an alternative", () => {
    expect(draftToBody(buildDraft({ mode: "quote", fromCode: "JFK", toCode: "ZRH", today: TODAY }))).not.toHaveProperty(
      "estimateShown",
    );
    const alternative = buildDraft({
      mode: "alternative",
      fromCode: "JFK",
      toCode: "ZRH",
      replacesFareId: "11111111-1111-4111-8111-111111111111",
      estimateShown: true,
      today: TODAY,
    });
    expect(alternative.estimateFor).toBeNull();
    expect(draftToBody(alternative)).not.toHaveProperty("estimateShown");
  });

  it("a quote that no longer asks about the route or cabin the member saw stops saying yes", () => {
    const draft = buildDraft({ mode: "quote", fromCode: "JFK", toCode: "ZRH", estimateShown: true, today: TODAY });
    expect(draftToBody({ ...draft, cabin: "first" })).not.toHaveProperty("estimateShown");
    const elsewhere = { ...draft, legs: [{ from: "JFK", to: "GVA", date: "2026-10-22" }, ...draft.legs.slice(1)] };
    expect(draftToBody(elsewhere)).not.toHaveProperty("estimateShown");
    // One way still asks about the route whose round-trip estimate the member saw: the e-mail says round trip.
    expect(draftToBody({ ...draft, tripType: "oneway" }).estimateShown).toBe(true);
  });
});
