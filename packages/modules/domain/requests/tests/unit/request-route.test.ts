import { describe, expect, it } from "bun:test";
import { calendarDay, requestDates } from "@bbc/shared/requests/display";
import { destinationCities, requestRoute, routeEnds } from "../../src/application/route";
import { MAX_SEND_ATTEMPTS, SEND_RETRY_MINUTES } from "../../src/infrastructure/requests.repo";
import { memberStatus, UNSENT_TOO_LONG_MS } from "../../src/application/to-request-vm";

const leg = (from: string, to: string) => ({ from, to, date: "2027-10-12" });

describe("requestRoute", () => {
  it("names the outbound leg of a round trip, never the way home", () => {
    expect(requestRoute([leg("JFK", "LHR"), leg("LHR", "JFK")], "round")).toBe("JFK → LHR");
  });

  it("names a one-way trip by its only leg", () => {
    expect(requestRoute([leg("JFK", "LHR")], "oneway")).toBe("JFK → LHR");
  });

  it("names a multi-city trip by its last stop, even when it ends at home", () => {
    expect(requestRoute([leg("JFK", "LHR"), leg("LHR", "CDG")], "multi")).toBe("JFK → CDG");
    expect(requestRoute([leg("JFK", "LHR"), leg("LHR", "CDG"), leg("CDG", "JFK")], "multi")).toBe("JFK → CDG");
  });

  it("says nothing when the legs say nothing", () => {
    expect(requestRoute([], "round")).toBe("");
    expect(requestRoute(null, "round")).toBe("");
    expect(requestRoute([{ from: 1, to: 2 }], "oneway")).toBe("");
    expect(routeEnds([leg("JFK", "LHR"), leg("LHR", "JFK")], undefined)).toEqual({ from: "JFK", to: "LHR" });
  });
});

describe("destinationCities", () => {
  const rows = [
    { legs: [leg("JFK", "LHR"), leg("LHR", "JFK")], tripType: "round" },
    { legs: [leg("JFK", "LHR")], tripType: "oneway" },
    { legs: [leg("JFK", "CDG")], tripType: "oneway" },
  ];

  it("reads each destination once, in one batch", async () => {
    const asked: string[][] = [];
    const cities = await destinationCities(
      rows,
      async (codes) => {
        asked.push(codes);
        return [
          { code: "LHR", city: "London" },
          { code: "CDG", city: "Paris" },
        ];
      },
      () => {},
    );
    expect(asked).toEqual([["LHR", "CDG"]]);
    expect([...cities]).toEqual([
      ["LHR", "London"],
      ["CDG", "Paris"],
    ]);
  });

  it("a failed read answers no cities and is reported — never thrown", async () => {
    const errors: unknown[] = [];
    const cities = await destinationCities(
      rows,
      async () => {
        throw new Error("catalog down");
      },
      (err) => errors.push(err),
    );
    expect(cities.size).toBe(0);
    expect(errors).toHaveLength(1);
  });

  it("asks nothing for nothing, and an empty city is no city", async () => {
    let calls = 0;
    const none = await destinationCities(
      [],
      async () => {
        calls++;
        return [];
      },
      () => {},
    );
    expect([none.size, calls]).toEqual([0, 0]);
    const blank = await destinationCities(
      rows.slice(2),
      async () => [{ code: "CDG", city: " " }],
      () => {},
    );
    expect(blank.size).toBe(0);
  });
});

describe("requestDates — the frames' `Oct 12–19`, shared with the app", () => {
  const on = (...dates: string[]) => dates.map((date) => ({ from: "JFK", to: "LHR", date }));
  it("names one month once, two months both, one day once", () => {
    expect(requestDates(on("2027-10-12", "2027-10-19"))).toBe("Oct 12–19");
    expect(requestDates(on("2027-10-30", "2027-11-06"))).toBe("Oct 30–Nov 6");
    expect(requestDates(on("2027-11-03"))).toBe("Nov 3");
  });
  it("a same-day return is one day, not `Oct 12–12`", () => {
    expect(requestDates(on("2027-10-12", "2027-10-12"))).toBe("Oct 12");
  });
  it("the same month a year apart names both; legs out of order still read forwards", () => {
    expect(requestDates(on("2026-10-12", "2027-10-05"))).toBe("Oct 12–Oct 5");
    expect(requestDates(on("2027-10-19", "2027-10-12"))).toBe("Oct 12–19");
  });
  it("a date that is not a day is left out; nothing usable reads as stored", () => {
    expect(requestDates(on("2027-10-12", "2027-13-01"))).toBe("Oct 12");
    expect(requestDates(on("2027-02-30"))).toBe("2027-02-30");
    expect(requestDates([])).toBe("");
    expect(requestDates(null)).toBe("");
  });
  it("calendarDay knows a leap year", () => {
    expect(calendarDay("2028-02-29")).toEqual({ year: 2028, month: 2, day: 29 });
    expect(calendarDay("2027-02-29")).toBeNull();
    expect(calendarDay("2027-1-1")).toBeNull();
  });
});

describe("memberStatus — what a member reads while a request is on its way", () => {
  const created = new Date("2027-10-01T12:00:00Z");
  const row = (over: Partial<Parameters<typeof memberStatus>[0]> = {}) => ({
    sentToCrm: false,
    status: "received" as const,
    sendAttempts: 0,
    createdAt: created,
    ...over,
  });
  const at = (ms: number) => created.getTime() + ms;
  it("held and not passed on yet: received", () => {
    expect(memberStatus(row(), at(60_000))).toBe("received");
    expect(memberStatus(row({ sendAttempts: MAX_SEND_ATTEMPTS - 1 }), at(60_000))).toBe("received");
  });
  it("the job gave up, or it waited too long for any reason: not_sent", () => {
    expect(memberStatus(row({ sendAttempts: MAX_SEND_ATTEMPTS }), at(60_000))).toBe("not_sent");
    expect(memberStatus(row(), at(UNSENT_TOO_LONG_MS + 1))).toBe("not_sent");
  });
  it("a state the CRM or an operator set wins, sent or not", () => {
    expect(memberStatus(row({ status: "quoted" }), at(60_000))).toBe("quoted");
    expect(memberStatus(row({ status: "quoted", sendAttempts: MAX_SEND_ATTEMPTS }), at(60_000))).toBe("quoted");
    expect(memberStatus(row({ sentToCrm: true, status: "booked" }), at(UNSENT_TOO_LONG_MS * 2))).toBe("booked");
    expect(memberStatus(row({ sentToCrm: true }), at(UNSENT_TOO_LONG_MS * 2))).toBe("received");
  });
  it("waiting too long means longer than the job's own tries could take — never while it still tries", () => {
    // Six tries, five minutes apart, the job running once a minute: the last one comes within 6 × 6 minutes.
    expect(UNSENT_TOO_LONG_MS).toBeGreaterThan(MAX_SEND_ATTEMPTS * (SEND_RETRY_MINUTES + 1) * 60_000);
  });
});
