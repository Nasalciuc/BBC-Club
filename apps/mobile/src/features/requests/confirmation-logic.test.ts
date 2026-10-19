import { test, expect } from "bun:test";
import type { ProposalCardVM } from "@bbc/shared/api/v1/proposals";

import { bodyProblem, confirmationKind, otherFares, retryMinutes, telHref, tripFacts } from "./confirmation-logic";
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
  expect(bodyProblem(issue(["legs", 1, "date"]))).toBe("Check your dates and try again.");
  expect(bodyProblem([])).toBeNull();
});

test("the trip under the route (08): the trip and the travelers", () => {
  expect(tripFacts("round", "1 adult")).toBe("Round trip · 1 adult");
  expect(tripFacts("oneway", "2 adults")).toBe("One way · 2 adults");
  expect(tripFacts("", "3 travelers")).toBe("3 travelers");
  expect(tripFacts("", "")).toBeNull();
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
