export type RateRule = {
  store: "postgres" | "memory";
  limit: number;
  periodMs: number;
  burst: number;
  fail: "open" | "closed";
};
const MIN = 60_000,
  HOUR = 3_600_000;
export const RULES = {
  read: { store: "memory", limit: 120, periodMs: MIN, burst: 60, fail: "open" },
  search: { store: "memory", limit: 60, periodMs: MIN, burst: 20, fail: "open" },
  anon: { store: "memory", limit: 300, periodMs: MIN, burst: 100, fail: "open" },
  "requests.submit": { store: "postgres", limit: 10, periodMs: HOUR, burst: 5, fail: "closed" },
  "requests.submit.ip": { store: "postgres", limit: 60, periodMs: HOUR, burst: 20, fail: "closed" },
  "profile.write": { store: "postgres", limit: 30, periodMs: HOUR, burst: 10, fail: "closed" },
  "devices.register": { store: "postgres", limit: 20, periodMs: HOUR, burst: 5, fail: "closed" },
  "ops.link": { store: "postgres", limit: 30, periodMs: MIN, burst: 10, fail: "closed" },
} as const satisfies Record<string, RateRule>;
export type RuleName = keyof typeof RULES;
