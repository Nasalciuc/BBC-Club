import http from "k6/http";
import { check } from "k6";
import { SharedArray } from "k6/data";
import { uuidv4 } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

const sessions = new SharedArray("sessions", () => JSON.parse(open("../sessions.json")));
const DEST = ["LHR", "CDG", "FCO", "DXB", "HND", "SIN", "BCN", "ZRH"];
const BASE = __ENV.BASE_URL;
const smoke = __ENV.SMOKE === "1";

export const options = smoke
  ? {
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
    }
  : {
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
    };

export default function () {
  const s = sessions[Math.floor(Math.random() * sessions.length)];
  const headers = { Cookie: s.cookie, "X-App-Platform": "ios", "X-App-Version": "1.0.0" };
  const r = Math.random();
  let res;
  if (r < 0.4) res = http.get(`${BASE}/v1/home`, { headers, tags: { ep: "home" } });
  else if (r < 0.7) res = http.get(`${BASE}/v1/proposals`, { headers, tags: { ep: "proposals" } });
  else if (r < 0.9)
    res = http.get(`${BASE}/v1/search?from=JFK&to=${DEST[Math.floor(Math.random() * DEST.length)]}&cabin=business`, {
      headers,
      tags: { ep: "search" },
    });
  else if (r < 0.98) res = http.get(`${BASE}/v1/requests`, { headers, tags: { ep: "requests" } });
  else
    res = http.post(`${BASE}/v1/requests`, JSON.stringify(s.requestBody), {
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Idempotency-Key": uuidv4(),
        "X-Forwarded-For": `${s.ip}, ${__ENV.LB_IP ?? "127.0.0.1"}`,
      },
      tags: { ep: "submit" },
    });
  check(res, { "status < 400": (x) => x.status < 400 });
}
