import http from "k6/http";
import { check } from "k6";
import { SharedArray } from "k6/data";

// docs/perf/LOADTEST.md. Sessions come from scripts/loadtest-staging.ts (staging) or loadtest/make-sessions.ts (local).
const sessions = new SharedArray("sessions", () => JSON.parse(open(__ENV.SESSIONS ?? "../sessions.json")));
const DEST = ["LHR", "CDG", "FCO", "DXB", "HND", "SIN", "BCN", "ZRH"];
const BASE = __ENV.BASE_URL;
if (!BASE) throw new Error("BASE_URL is required, e.g. https://api-staging.buybusinessclass.com");
// smoke: 50 RPS for a minute. step: up 100 RPS every 2 minutes to MAX_RPS, stopped by the first threshold that fails —
// the last step that held is the answer. full: the 1,000 RPS ramp of docs/perf/CAPACITY.md.
const PROFILE = __ENV.PROFILE ?? (__ENV.SMOKE === "1" ? "smoke" : "full");
const MAX_RPS = Number(__ENV.MAX_RPS ?? 400);
// Enough VUs for half a second per request at MAX_RPS; slower than that fails the run anyway. Grafana Cloud bills the
// configured maximum (VU hours = maxVUs × minutes / 60), so this is also the cost of a run.
const MAX_VUS = Number(__ENV.MAX_VUS ?? Math.ceil(MAX_RPS / 2));
// Off unless asked: a write is a real request on staging, through its CRM adapter, and the submit limits (10 an hour
// per member, 60 per IP) answer 429 long before any capacity limit.
const WRITES = __ENV.WRITES === "1";

function stepStages(max) {
  const stages = [];
  for (let rps = 100; rps <= max; rps += 100) {
    stages.push({ target: rps, duration: "30s" }, { target: rps, duration: "90s" });
  }
  return stages;
}

// Grafana Cloud k6 runs it from Frankfurt, near the box (`k6 cloud run`); a local run ignores this.
const cloud = {
  name: `BBC Club ${PROFILE}`,
  distribution: { frankfurt: { loadZone: "amazon:de:frankfurt", percent: 100 } },
};

const profiles = {
  smoke: {
    cloud,
    scenarios: {
      mixed: {
        executor: "constant-arrival-rate",
        rate: 50,
        timeUnit: "1s",
        duration: "60s",
        preAllocatedVUs: 80,
        maxVUs: 200,
      },
    },
    thresholds: {
      http_req_failed: ["rate<0.01"],
      http_req_duration: ["p(95)<800"],
    },
  },
  step: {
    cloud,
    scenarios: {
      mixed: {
        executor: "ramping-arrival-rate",
        startRate: 50,
        timeUnit: "1s",
        preAllocatedVUs: Math.min(100, MAX_VUS),
        maxVUs: MAX_VUS,
        stages: stepStages(MAX_RPS),
      },
    },
    thresholds: {
      http_req_failed: [{ threshold: "rate<0.01", abortOnFail: true, delayAbortEval: "30s" }],
      http_req_duration: [{ threshold: "p(95)<800", abortOnFail: true, delayAbortEval: "30s" }],
      dropped_iterations: [{ threshold: "count<100", abortOnFail: true, delayAbortEval: "30s" }],
    },
  },
  full: {
    cloud,
    scenarios: {
      mixed: {
        executor: "ramping-arrival-rate",
        startRate: 50,
        timeUnit: "1s",
        preAllocatedVUs: 400,
        maxVUs: 3000,
        stages: [
          { target: 250, duration: "2m" },
          { target: 500, duration: "2m" },
          { target: 1000, duration: "2m" },
          { target: 1000, duration: "10m" },
        ],
      },
    },
    thresholds: {
      http_req_failed: ["rate<0.001"],
      http_req_duration: ["p(95)<300", "p(99)<800"],
      "http_req_duration{ep:home}": ["p(95)<300"],
      "http_req_duration{ep:search}": ["p(95)<300"],
      "http_req_duration{ep:proposals}": ["p(95)<250"],
    },
  },
};
if (!profiles[PROFILE]) throw new Error(`PROFILE must be smoke, step or full (got: ${PROFILE})`);
export const options = profiles[PROFILE];

export default function () {
  const s = sessions[Math.floor(Math.random() * sessions.length)];
  const headers = { Cookie: s.cookie, "X-App-Platform": "ios", "X-App-Version": "1.0.0" };
  // A secret a Cloudflare WAF rule can match to let the test past bot protection (docs/perf/LOADTEST.md).
  if (__ENV.LOADTEST_HEADER) headers["X-Load-Test"] = __ENV.LOADTEST_HEADER;
  const r = Math.random();
  let res;
  if (r < 0.4) res = http.get(`${BASE}/v1/home`, { headers, tags: { ep: "home" } });
  else if (r < 0.7) res = http.get(`${BASE}/v1/proposals`, { headers, tags: { ep: "proposals" } });
  else if (r < 0.9)
    res = http.get(`${BASE}/v1/search?from=JFK&to=${DEST[Math.floor(Math.random() * DEST.length)]}&cabin=business`, {
      headers,
      tags: { ep: "search" },
    });
  else if (r < 0.98 || !WRITES) res = http.get(`${BASE}/v1/requests`, { headers, tags: { ep: "requests" } });
  else
    res = http.post(`${BASE}/v1/requests`, JSON.stringify(s.requestBody), {
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(), // k6's Web Crypto: no script fetched from the network
        "X-Forwarded-For": `${s.ip}, ${__ENV.LB_IP ?? "127.0.0.1"}`,
      },
      tags: { ep: "submit" },
    });
  check(res, { "status < 400": (x) => x.status < 400 });
}
