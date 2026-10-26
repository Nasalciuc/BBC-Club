/** The rules against the company's site (ADR-IMPL-062): the sample, the comparison, what the loader prints, its verdict. */
import { describe, expect, it } from "bun:test";

import { CONTINENT_OF } from "../../src/pricing/continents";
import { formulaPrice } from "../../src/pricing/estimate";
import { RULE_PAIRS } from "../../src/pricing/rules";
import {
  SITE_CHECK_GAP_MS,
  SITE_CHECK_SAMPLE,
  SITE_SEARCH,
  checkRulesAgainstSite,
  siteCheckLines,
  siteCheckVerdict,
  type SiteCheckRoute,
} from "../../src/pricing/site-check";
import { FIXTURE_RULES as R } from "./pricing-rules.fixture";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** What the formula gives with `R`: the site, when its rules are `R`. */
const figures = (route: SiteCheckRoute) => ({
  premium_economy: formulaPrice(R, route.from, route.to, route.trip, "premium_economy"),
  business: formulaPrice(R, route.from, route.to, route.trip, "business"),
  first: formulaPrice(R, route.from, route.to, route.trip, "first"),
});

/** The site as `fetch`, answering each route through `answer` (by `FROM-TO trip`), noting every request. */
function fakeSearch(answer: (key: string, route: SiteCheckRoute) => Response | Promise<Response>) {
  const asked: { url: string; userAgent: string }[] = [];
  let inFlight = 0;
  let most = 0;
  const fetch = async (url: string, init?: RequestInit) => {
    inFlight += 1;
    most = Math.max(most, inFlight);
    try {
      asked.push({ url, userAgent: String((init?.headers as Record<string, string>)["User-Agent"]) });
      const q = new URL(url).searchParams;
      const route = SITE_CHECK_SAMPLE.find(
        (r) => r.from.code === q.get("from") && r.to.code === q.get("to") && r.trip === q.get("trip_type"),
      )!;
      await Promise.resolve();
      return await answer(`${q.get("from")}-${q.get("to")} ${q.get("trip_type")}`, route);
    } finally {
      inFlight -= 1;
    }
  };
  return { fetch, asked, most: () => most };
}

describe("the site check's sample", () => {
  it("24 requests: two routes for every continent pair, each round trip and one way", () => {
    expect(SITE_CHECK_SAMPLE).toHaveLength(24);
    for (const pair of RULE_PAIRS)
      for (const trip of ["round_trip", "one_way"] as const)
        expect(`${pair} ${trip} ${SITE_CHECK_SAMPLE.filter((r) => r.pair === pair && r.trip === trip).length}`).toBe(
          `${pair} ${trip} 2`,
        );
  });

  it("each route's pair is the formula's, from North America; Istanbul and a Q are in it; LAX only as a destination", () => {
    for (const r of SITE_CHECK_SAMPLE) {
      const [a, b] = [CONTINENT_OF[r.from.countryCode], CONTINENT_OF[r.to.countryCode]];
      expect(a).toBe("NA");
      expect(String(r.pair)).toBe(b === "NA" ? "LOCAL" : `NA-${b}`);
      expect(r.from.code).not.toBe("LAX");
    }
    expect(SITE_CHECK_SAMPLE.some((r) => r.to.countryCode === "TR")).toBe(true);
    expect(SITE_CHECK_SAMPLE.filter((r) => /Q/.test(r.from.code + r.to.code)).length).toBeGreaterThanOrEqual(2);
  });
});

describe("checkRulesAgainstSite", () => {
  it("rules the site prices by: every route matches, asked one at a time, 500 ms apart, with the club's agent", async () => {
    const site = fakeSearch((_, route) => json(figures(route)));
    const slept: number[] = [];
    const result = await checkRulesAgainstSite(R, {
      fetch: site.fetch,
      userAgent: "BBCClub/test",
      sleep: async (ms) => {
        slept.push(ms);
      },
    });
    expect(result.business).toEqual({ matched: 24, differed: 0, noAnswer: 0 });
    expect(result.first).toEqual({ matched: 24, differed: 0, noAnswer: 0 });
    expect(result.differs).toEqual({ business: [], first: [] });
    expect(site.asked).toHaveLength(24);
    expect(site.most()).toBe(1);
    expect(slept).toEqual(Array.from({ length: 23 }, () => SITE_CHECK_GAP_MS));
    expect(site.asked[0]).toEqual({
      url: `${SITE_SEARCH}?from=JFK&to=LAX&trip_type=round_trip`,
      userAgent: "BBCClub/test",
    });
    expect(new Set(site.asked.map((a) => a.userAgent))).toEqual(new Set(["BBCClub/test"]));
  });

  it("names the routes that differ, per cabin; a route the site does not answer is counted apart", async () => {
    const site = fakeSearch((key, route) => {
      const f = figures(route);
      if (key === "JFK-IST round_trip") return json({ ...f, business: f.business! + 7 });
      if (key === "ORD-SVQ one_way") return json({ ...f, business: f.business! + 3, first: f.first! - 1 });
      if (key === "MIA-YQB round_trip") return json({ ...f, first: null }); // no first-class figure
      if (key === "DFW-AKL one_way") return json({ error: "Offer not found" }, 404);
      if (key === "SFO-SYD one_way") return new Response("<html>busy</html>", { status: 200 });
      if (key === "IAD-ADD one_way") return Promise.reject(new Error("The operation timed out."));
      if (key === "JFK-BOG one_way") return json({ business: "1200", first: 1500.5 }); // not whole dollars
      return json(f);
    });
    const result = await checkRulesAgainstSite(R, {
      fetch: site.fetch,
      userAgent: "BBCClub/test",
      sleep: async () => {},
    });
    // No answer: the 404, the page that is not JSON, the timeout, and figures that are not whole dollars; first also
    // where the site has no first-class figure.
    expect(result.business).toEqual({ matched: 18, differed: 2, noAnswer: 4 });
    expect(result.first).toEqual({ matched: 18, differed: 1, noAnswer: 5 });
    expect(result.differs).toEqual({
      business: ["ORD-SVQ one_way", "JFK-IST round_trip"],
      first: ["ORD-SVQ one_way"],
    });
    expect(site.asked).toHaveLength(24);
  });

  it("prints counts and route codes only — never the site's figure or the formula's", async () => {
    const seen = new Set<number>();
    const site = fakeSearch((key, route) => {
      const f = figures(route);
      const answer = key === "JFK-ZRH round_trip" ? { ...f, business: 9871, first: 9872 } : f;
      for (const v of [...Object.values(answer), ...Object.values(f)]) if (typeof v === "number") seen.add(v);
      return json(answer);
    });
    const result = await checkRulesAgainstSite(R, {
      fetch: site.fetch,
      userAgent: "BBCClub/test",
      sleep: async () => {},
    });
    const lines = siteCheckLines(result);
    expect(lines).toEqual([
      "site check — business: 23 matched · 1 differed · 0 no answer",
      "  differ: JFK-ZRH round_trip",
      "site check — first: 23 matched · 1 differed · 0 no answer",
      "  differ: JFK-ZRH round_trip",
    ]);
    const printed = lines.join("\n");
    for (const v of seen) expect(printed.includes(String(v)) ? v : null).toBeNull();
  });
});

describe("siteCheckVerdict — what makes the loader exit 1", () => {
  /** The check against a site answering through `answer`, with no waits. */
  const check = (answer: (key: string, route: SiteCheckRoute) => Response | Promise<Response>) =>
    checkRulesAgainstSite(R, { fetch: fakeSearch(answer).fetch, userAgent: "BBCClub/test", sleep: async () => {} });

  it("passes when every route matches in both cabins", async () => {
    expect(siteCheckVerdict(await check((_, route) => json(figures(route))))).toEqual({ pass: true, problems: [] });
  });

  it("passes when only first goes unanswered — a cabin the site does not price is no difference", async () => {
    const result = await check((key, route) =>
      json(key === "MIA-YQB round_trip" ? { ...figures(route), first: null } : figures(route)),
    );
    expect(result.first.noAnswer).toBe(1);
    expect(siteCheckVerdict(result)).toEqual({ pass: true, problems: [] });
  });

  it("fails when a route differs", async () => {
    const result = await check((key, route) => {
      const f = figures(route);
      return json(key === "JFK-IST round_trip" ? { ...f, business: f.business! + 7 } : f);
    });
    expect(siteCheckVerdict(result)).toEqual({
      pass: false,
      problems: ["these rules do not give the site's prices on the routes above"],
    });
  });

  it("fails when the site gave no business figure for a route, though every answer matched — a half check is no pass", async () => {
    // The two routes with a Q time out and are rate-limited: a set wrong only there must not pass.
    const result = await check((key, route) => {
      if (key === "MIA-YQB round_trip") return Promise.reject(new Error("The operation timed out."));
      if (key === "ORD-SVQ one_way") return json({ message: "Too Many Requests" }, 429);
      return json(figures(route));
    });
    expect(result.business).toEqual({ matched: 22, differed: 0, noAnswer: 2 });
    expect(siteCheckVerdict(result)).toEqual({
      pass: false,
      problems: ["the site gave no business figure for 2 of 24 routes — not a pass; run it again"],
    });
  });

  it("fails when the site answered nothing, and when nothing was asked", async () => {
    const none = await check(() => json({ error: "Offer not found" }, 404));
    expect(siteCheckVerdict(none)).toEqual({
      pass: false,
      problems: ["the site gave no business figure for 24 of 24 routes — not a pass; run it again"],
    });
    const empty = await checkRulesAgainstSite(R, { fetch: fakeSearch(() => json({})).fetch, userAgent: "x" }, []);
    expect(siteCheckVerdict(empty).pass).toBe(false);
  });
});
