import { describe, expect, it } from "bun:test";

import { buildDraft, defaultDates, draftToBody } from "./useRequestDraft";

const TODAY = "2026-10-08";

describe("buildDraft — dates", () => {
  it("suggests two weeks out and a week long when nothing was chosen — never a fixed day", () => {
    expect(defaultDates(TODAY)).toEqual({ depart: "2026-10-22", ret: "2026-10-29" });
    const draft = buildDraft({ mode: "quote", fromCode: "JFK", toCode: "LHR", today: TODAY });
    expect(draft.tripType).toBe("round");
    expect(draft.legs.map((l) => l.date)).toEqual(["2026-10-22", "2026-10-29"]);
    // The old fixture (12–19 Oct 2026) is gone: a year later the suggestion still lies ahead.
    expect(buildDraft({ mode: "quote", today: "2027-10-08" }).legs[0]?.date).toBe("2027-10-22");
  });

  it("carries the dates chosen on Home, round trip or one way", () => {
    const round = buildDraft({
      mode: "quote",
      today: TODAY,
      search: {
        dates: { depart: "2026-11-03", return: "2026-11-10", flexible: false },
        cabin: "business",
        passengers: { adult: 1, child: 0, infant: 0 },
      },
    });
    expect(round.tripType).toBe("round");
    expect(round.legs.map((l) => l.date)).toEqual(["2026-11-03", "2026-11-10"]);

    const oneWay = buildDraft({
      mode: "quote",
      today: TODAY,
      search: {
        dates: { depart: "2026-11-03", return: null, flexible: false },
        cabin: "business",
        passengers: { adult: 1, child: 0, infant: 0 },
      },
    });
    expect(oneWay.tripType).toBe("oneway");
    expect(draftToBody(oneWay).legs).toHaveLength(1);
    expect(oneWay.legs[0]?.date).toBe("2026-11-03");
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
    expect(fromSearch.legs.map((l) => l.date)).toEqual(["2026-10-22", "2026-10-29"]);

    const fare = { cabin: "first", from: { code: "JFK" }, to: { code: "LHR" }, offerId: null, price: { offer: 1 } };
    const fromFare = buildDraft({ fare: fare as never, profile, search, today: TODAY });
    expect(fromFare.cabin).toBe("first");
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
