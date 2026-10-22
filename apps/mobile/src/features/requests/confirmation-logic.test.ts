import { test, expect } from "bun:test";
import type { ProposalCardVM } from "@bbc/shared/api/v1/proposals";

import { RequestBody } from "@bbc/shared/api/v1/requests";

import {
  REQUEST_NAME_MAX,
  bodyProblem,
  confirmationKind,
  limitScope,
  limitedCopy,
  otherFares,
  retryMinutes,
  telHref,
  tripFacts,
} from "./confirmation-logic";
test("the confirmation follows the source; offline always wins", () => {
  expect(confirmationKind("offer", false)).toBe("offer");
  expect(confirmationKind("search", false)).toBe("search");
  expect(confirmationKind("search", true)).toBe("saved");
  expect(confirmationKind("offer", true)).toBe("saved");
});
test("retry minutes: whole minutes, at least one", () => {
  expect(retryMinutes(360)).toBe(6); // requests.submit: 1 h / 10 = 6 min
  expect(retryMinutes(61)).toBe(2);
  expect(retryMinutes(30)).toBe(1);
  expect(retryMinutes(0)).toBe(1);
  expect(retryMinutes(undefined)).toBe(1);
  expect(retryMinutes(Number.NaN)).toBe(1);
});
test("the rate-limit page blames the member only for the member's own limit (F086)", () => {
  // A shared address (an office, a hotel, a carrier's NAT): the member may have sent nothing.
  expect(limitedCopy({ scope: "ip", minutes: 5, canCall: true })).toEqual({
    title: "We couldn’t take this request just now.",
    body: "Try again in 5 minutes, or call your specialist.",
  });
  expect(limitedCopy({ scope: "member", minutes: 6, canCall: true })).toEqual({
    title: "You’ve sent several requests this hour.",
    body: "You can send another in 6 minutes. Your specialist already has the others.",
  });
  // An older server says nothing of the scope: the neutral words, never the blame.
  expect(limitedCopy({ minutes: 1, canCall: false })).toEqual({
    title: "We couldn’t take this request just now.",
    body: "Try again in 1 minute.",
  });
  expect(limitScope({ scope: "ip" })).toBe("ip");
  expect(limitScope({ scope: "member" })).toBe("member");
  expect(limitScope({ scope: "office" })).toBeNull();
  expect(limitScope(undefined)).toBeNull();
  expect(limitScope("member")).toBeNull();
});

test("no verified number, no call button", () => {
  expect(telHref(undefined)).toBeNull();
  expect(telHref("")).toBeNull();
  expect(telHref("+1 (212) 555-0148")).toBe("tel:+12125550148");
  expect(telHref("123")).toBeNull();
});

test("a request whose details cannot go says what to fix, calmly — never zod's own words", () => {
  const issue = (path: (string | number)[], message = "String must contain at least 2 character(s)") => [
    { path, message },
  ];
  expect(bodyProblem(issue(["contact", "name"]))).toBe("Add your name, so your specialist knows who to ask for.");
  expect(bodyProblem(issue(["contact", "email"], "Invalid email"))).toBe("Add an email address we can write to.");
  expect(bodyProblem(issue(["contact", "phone"], "That phone number doesn't look right."))).toBe(
    "That phone number doesn't look right.",
  );
  expect(bodyProblem(issue(["note"]))).toBe("Keep the note under 500 characters.");
  expect(bodyProblem(issue(["legs", 1, "date"]))).toBe(
    "Check your dates: a day from today on, and the return on or after the departure.",
  );
  expect(bodyProblem([])).toBeNull();
});

test("a name the request cannot take says what to do with it — never 'Add your name' when it is there (F100)", () => {
  const body = (name: string) => ({
    tripType: "oneway" as const,
    cabin: "business" as const,
    legs: [{ from: "JFK", to: "LHR", date: "2026-11-10" }],
    passengers: { adult: 1, child: 0, infant: 0 },
    contact: { name, phone: "+12125550148", email: "ada@example.com" },
  });
  const problem = (name: string) => {
    const parsed = RequestBody.safeParse(body(name));
    expect(parsed.success).toBe(false);
    return parsed.success ? null : bodyProblem(parsed.error.issues, body(name));
  };
  expect(problem("")).toBe("Add your name, so your specialist knows who to ask for.");
  expect(problem("A")).toBe("Use your full name.");
  expect(problem("A".repeat(81))).toBe("Shorten the name to 80 characters.");
  expect(REQUEST_NAME_MAX).toBe(80);
});

test("an impossible trip says what to change, calmly — the dates, the route, the travelers or the fare", () => {
  const issue = (path: (string | number)[], message = "That day has passed. Choose a date from today on.") => [
    { path, message },
  ];
  const dates = "Check your dates: a day from today on, and the return on or after the departure.";
  expect(bodyProblem(issue(["legs", 0, "date"]))).toBe(dates);
  expect(bodyProblem(issue(["legs"], "A round trip has two flights: there and back."))).toBe(dates);
  expect(bodyProblem(issue(["legs", 0, "to"], "Choose a destination other than where the flight leaves from."))).toBe(
    "Choose a destination other than where the flight leaves from.",
  );
  expect(bodyProblem(issue(["passengers", "infant"], "x"))).toBe(
    "Each infant travels on an adult's lap: add an adult, or an infant less.",
  );
  expect(bodyProblem(issue(["fareId"], "x"))).toBe(
    "This fare can't be requested any more. Ask for a quote on the route instead.",
  );
});

test("the trip under the route (08): the trip and the travelers", () => {
  expect(tripFacts("round", "1 adult")).toEqual(["Round trip", "1 adult"]);
  expect(tripFacts("oneway", "2 adults")).toEqual(["One way", "2 adults"]);
  expect(tripFacts("", "3 travelers")).toEqual(["3 travelers"]);
  expect(tripFacts("", "")).toEqual([]);
});

test("other great fares (08): Home's offers to other cities, one per city, six at most", () => {
  const offer = (id: string, to: string) => ({ id, route: { from: "JFK", to } }) as unknown as ProposalCardVM;
  const home = {
    sections: [
      { key: "inspire", title: "Offers to inspire", items: [offer("a", "LHR"), offer("b", "CDG"), offer("c", "HND")] },
      { key: "europe", title: "To Europe", items: [offer("d", "CDG"), offer("e", "FCO")] },
    ],
  };
  expect(otherFares(home, "LHR").map((o) => o.id)).toEqual(["b", "c", "e"]);
  expect(otherFares(home, "LHR", 2).map((o) => o.id)).toEqual(["b", "c"]);
  expect(otherFares(null, "LHR")).toEqual([]);
});
