# ADR-IMPL-065 — CRM http adapter

Status: proposed · Date: 2026-10-25 · Scope: `packages/shared/src/env.ts` (`CRM_API_URL`, `CRM_API_SECRET`;
`CRM_ADAPTER=http` accepted — AGENTS.md rule 9), `integration/crm` (the adapter and its errors), `domain/requests`
(`send-requests` gives a refused request up at once), the app's words for a request not passed on (brief 3.5),
`infra/env/*.env.example`, `infra/RUNBOOK.md`, `docs/store/data-safety.md` · Amends ADR-IMPL-023 point 1 (`http` no
longer throws) and ADR-IMPL-042, "The state a member reads" (the six-attempt rule: a request the CRM refuses is given up
at once; the app offers the call only when the build has the club's general line, and otherwise says the club will try
again, without asking the member to send the request a second time) and ADR-IMPL-041, "A request that will not go out
by itself" (the call, its words and the list's hint at it only with the club's general line). No migration.

**Context.**

- **Requests reach the specialists by e-mail today.** The `email` adapter (ADR-IMPL-023) sends each request as one
  e-mail with three signed links (Quote sent, Booked, Closed). The company's CRM is to take over. Its address, its
  authentication and the payload it wants are not known yet, and `CRM_ADAPTER=http` stopped the API at boot.
- **Both ends exist already.** The port (`CrmFacade.submitRequest`) and the payload (`CrmRequestPayload`) are what
  `send-requests` hands any adapter. The way back is built: `POST /v1/internal/requests/:id/status` (requests,
  permission `requests:update-any`, the system principal's `X-Internal-Secret`), forward only and idempotent.
- **`send-requests` knew one kind of failure.** It stored any error and tried again five minutes later, six times in
  all. A CRM that refuses a request as it is would refuse each copy.

**Decision.**

1. **Settings, through `loadEnv` only.** `CRM_API_URL` and `CRM_API_SECRET` (at least 32 characters) are required when
   `CRM_ADAPTER=http`; `loadEnv` (so `scripts/check-env.ts`, before a deploy) names each one missing. The address is
   https: the requests carry the member's name, phone and e-mail. Plain http is accepted only to localhost and never in
   production, for a test's fake CRM. In production (staging too, which runs as production) the address is also
   public: `localhost`, `*.localhost` and an IP literal in a loopback, private, carrier-NAT or link-local range are
   refused — IPv4 0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.168/16; IPv6 `::`, `::1`, fc00::/7,
   fe80::/10, and those ranges mapped from IPv4 — so the members' details never go to this machine, a private network
   or a cloud's metadata service. A name is checked as written, not resolved: one whose DNS points inside is the
   operator's to avoid, as the setting is the operator's alone (no request can change it). The address carries no
   credentials. `CRM_API_SECRET` is one of the secrets a template comment cannot stand in for. The env examples drop `CRM_DB_URL` and `CRM_API_TOKEN`, which no code read.
2. **One call per request.** `POST <CRM_API_URL>`, `Content-Type: application/json`. The body is the
   `CrmRequestPayload` that `send-requests` built, minus two fields. `_actions` goes because the operator links act on
   the request, and over http the CRM reports through the status route instead. `_attempt` goes so that a resend is the
   same body. `_request_id` stays: the status route needs it. A redirect is refused, never followed.
3. **Signed.** Each call carries two headers:

   | Header            | Value                                                                         |
   | ----------------- | ----------------------------------------------------------------------------- |
   | `X-BBC-Timestamp` | Unix time in seconds, as decimal text (`1800000000`)                          |
   | `X-BBC-Signature` | lowercase hex of HMAC-SHA256, key `CRM_API_SECRET`, over `<timestamp>.<body>` |

   `<body>` is the request body's exact bytes, UTF-8, as sent. The key is the secret's characters as UTF-8 bytes, as
   both sides hold it in their settings: never hex- or base64-decoded, even when it looks like hex (the env example
   suggests `openssl rand -hex 32`, and those 64 characters are the key). Only the timestamp and the body are signed —
   not the method, the path or another header. To check a call, the CRM:
   - reads the raw body before parsing it;
   - computes `hex(HMAC_SHA256(secret, timestamp + "." + body))`;
   - compares it with `X-BBC-Signature` in constant time;
   - refuses a timestamp more than 300 seconds from its own clock (our suggestion), so a captured call cannot be
     replayed later;
   - refuses a call whose `Idempotency-Key` differs from the body's `reference` (point 4): the header is not signed, the
     body is, so a call replayed within the window under another key would otherwise pass its de-duplication.

   Each try signs its own timestamp. The secret never leaves the server. Test vectors, with made-up values (timestamp
   `1700000000`, body `{"reference":"R-T001"}`; `http-crm.test.ts` holds them):

   | Key                                               | `X-BBC-Signature`                                                  |
   | ------------------------------------------------- | ------------------------------------------------------------------ |
   | `a` × 32                                          | `e9cac67c8d4e9078b3988338555ba85410dce442215986480495561ecd617a37` |
   | `made-up-signing-key-not-hex-0001`                | `8906ce4ebc5577e87e8fbb382d9639bc868f39eb40c82cbdfa8ee9197aa4d5cb` |
   | `a` × 32 hex-decoded (16 bytes `0xaa`): **wrong** | `b63f6006d4a8d069d2929ed5c894124a136ba2e4b4ede08b161f1b5972d6de7d` |

4. **Idempotent on the reference.** `Idempotency-Key: <reference>` (`R-` and eight hex digits, unique per request,
   `requests_reference`), the same value as the signed body's `reference`. A resend is the same key and the same body:
   a copy the CRM can drop. One exception: an
   offer request's `offer` is read at each try, so a resend after the offer changed carries its new price. A send that
   timed out may have arrived, and its resend is that copy. We expect a 2xx for a key the CRM has already seen.
5. **5 s per call.** The adapter's own `AbortSignal.timeout` (injectable, so the tests take 200 ms), inside the 5 s
   ceiling `withCrmTimeout` keeps around every adapter.
6. **Retries.** Failures propagate (AGENTS.md rules 3 and 4). Every error says whether trying again can help
   (`retryable`, `CrmFailure` in the api):

   | Outcome                                        | Error                    | Retryable | `send-requests`                                  |
   | ---------------------------------------------- | ------------------------ | --------- | ------------------------------------------------ |
   | 2xx                                            | —                        | —         | marked sent; `crm_request_id` `http:<reference>` |
   | no answer within 5 s                           | `CrmTimeoutError`        | yes       | tried again 5 minutes later, 6 attempts in all   |
   | DNS, refused or reset connection, TLS          | `CrmUnreachableError`    | yes       | the same                                         |
   | 408, 429, 5xx                                  | `CrmHttpError`           | yes       | the same (a 429's `Retry-After` is not read)     |
   | any other 4xx (400, 401, 403, 404, 409, 422 …) | `CrmHttpError`           | no        | given up at once: counted as the sixth attempt   |
   | 1xx, 3xx (a redirect, not followed)            | `CrmHttpError`           | no        | the same                                         |
   | the request has no reference                   | `CrmRequestInvalidError` | no        | the same; nothing is sent                        |

   A request given up at once follows the path the sixth failure already had. The member reads `Not sent`, the log
   says `request send gave up` (`refused: true`), `bbc_request_sends_given_up` rises, and `OPS_WEBHOOK` gets one
   line. That line says the CRM refused the request and that the log says why. An operator re-queues the request once
   the cause is fixed (RUNBOOK). An error names the call and the status only: the answer's body is never read, since it
   may repeat the member's details. The adapter logs nothing, and `send-requests` stores `errorLine(err)` as before.

7. **`findByEmail` answers null, without a call**, as the e-mail adapter does. It runs inside the profile's insert, at
   `member.registered` and right after the join code. A call there would hold a pooled connection on the CRM for up to
   5 s, and an outage of the CRM would stop sign-ups. It would also send every new address to the CRM before the member
   has asked for anything. Matching a member is the read-only mirror's job (`crm.*`, `sync-mirror`, stage 5), and the
   CRM's lookup is not known. The consequence is the one the e-mail adapter has today: a new member is on the
   waitlist unless `members.allow_non_crm_signups` is on. Sign-up works the same, and a test proves it.
   `createActivity` answers `{ id: null }` without a call: no code calls it, and the CRM has no endpoint for it yet.
8. **The status comes back as it does now.** The CRM calls `POST /v1/internal/requests/<_request_id>/status` with
   `X-Internal-Secret` and `{ "status": "assigned" | "quoted" | "booked" | "closed", "note"?, "agentId"? }`. A step back
   is answered 409. A repeat changes nothing and is answered `unchanged: true`. The `note` is shown to the member.
   `INTERNAL_API_SECRET` is the system principal's (`packages/shared/src/authz/principal.ts`): besides
   `requests:update-any` it holds `proposals:ingest`, `proposals:withdraw`, `conversions:ingest`, `jobs:run`,
   `catalog:import`, `campaigns:manage`, `ops:read` and `ops:act` (`permissions.ts`). Handed to the CRM, it would let
   the CRM publish and withdraw offers, import fares, run jobs and manage campaigns. The route is kept as it is; before
   the CRM calls it, it gets a credential of its own (Left to the owner). Narrowing it changes authz, which needs its
   own ADR (AGENTS.md rule 9).

**Consequences.**

- Moving from `email` to `http` is a change of env, not of code. The specialists then get no e-mail, and the CRM gets
  no operator links.
- A wrong secret makes the CRM answer 401 to everything. Under point 6 every request is then given up at once, with
  one ops line each: loud and quick to see. After the fix, the requests are re-queued (RUNBOOK). Retrying 401s instead
  would only delay the same failure by half an hour.
- The CRM receives the fields the e-mail carried (`docs/store/data-safety.md`), and nothing is logged on the way.
- Tests:
  - `packages/modules/integration/crm/tests/contract/http-crm.test.ts`, against a fake CRM (`Bun.serve` on port 0):
    - the signature verifies with the secret, not with another, and not over a changed body; point 3's vectors, the
      key never decoded;
    - `Idempotency-Key` is the reference and the body's `reference`, and a resend sends the same key and body;
    - a hanging CRM is a retryable timeout, within the adapter's ceiling and within `withCrmTimeout`'s;
    - 500, 503, 429 and 408 are retryable; 400, 401, 403, 404, 409, 422 and a redirect are permanent;
    - an unreachable CRM is retryable;
    - no body, secret or member's detail is in an error;
    - no call for `findByEmail`.
  - `crm-adapter-env.test.ts` and `scripts/check-env.test.ts`: both settings are required, a short or commented-out
    secret is refused, https only, no credentials in the address, and in production no loopback, private or
    link-local address (the metadata service, `127.0.0.1` written as a number, an IPv4-mapped IPv6 among them).
  - `domain/requests/tests/contract/send-requests.test.ts`: a 400 is given up after one attempt, and a re-queue sends
    it; a 503, a 429, a timeout and a plain error are tried again.
  - `apps/api/test/crm-delivery.test.ts`, with the host built from env:
    - `email` (D14): one request is exactly one operator e-mail with three distinct links, and following Quoted moves
      the member's request to `quoted`;
    - `http`: signed and keyed on the reference, the CRM's `quoted` reaches the member with its note, an anonymous
      call is refused, a 503 is retried under the same key and body, a 400 leaves the member reading `not_sent`;
    - sign-up makes no CRM call.

**Left to the owner.**

- **A credential of its own for the CRM's status calls, before go-live.** Not `INTERNAL_API_SECRET`, which unlocks
  every system permission (point 8): a separate secret or JWT whose principal holds `requests:update-any` only. Its own
  ADR (authz, `packages/shared`).
- **Join's line.** Without the number, one message still asks the member to call: Join's
  `We couldn't send a code to that address. Check it, or call us.` (`apps/mobile/src/features/auth/otp-send-logic.ts`,
  when the mail service refuses the address). It belongs to the entry, which stays exactly as it is (ADR-IMPL-046,
  ADR-IMPL-047), so it is not changed here; `support-phone.test.ts` lets it through by name, and `docs/release.md`, the
  app's `.env.example` and `lib/env.ts` name it where they say no words ask for a call. Dropping `or call us` from a
  build without the line amends ADR-IMPL-047: the owner's decision.
- **The CRM's real address and authentication.** Is an HMAC signature acceptable to the CRM, or does it need its own
  (an API key in a header, OAuth)? A different scheme changes the adapter.
- **The payload mapping.** Today the CRM receives `CrmRequestPayload` as it is: snake_case, the fields of
  `packages/modules/integration/crm/src/api/index.ts`. The CRM's own field names, its required fields, and whether it
  answers with its own id, which `crm_request_id` would then keep instead of `http:<reference>`.
- **Questions for the CRM team:**
  1. **Members (`findByEmail`).** Is there a lookup by e-mail, or a read-only export for the mirror? Which fields
     (client id, name, home airport), and how fresh?
  2. **Status callbacks.** Will the CRM call `POST /v1/internal/requests/:id/status` for quoted, booked and closed?
     Which of its states map to ours? It gets a credential scoped to that route (above), not `INTERNAL_API_SECRET`;
     who keeps it on its side? The `note` is shown to the member.
  3. **The idempotency window.** How long does the CRM remember an `Idempotency-Key`? What does it answer for a key it
     has seen: we expect a 2xx, and a 409 would give the request up as refused. What happens to a key reused with a
     changed body (an offer repriced between two tries)?
  4. **Rate limits.** How many calls a minute, and does it answer 429 with `Retry-After`? We send at most 20 a minute,
     one at a time.
  5. **The rest of the signature.** Is 300 seconds of clock difference acceptable? Does it answer 401 to a bad
     signature? Will it key the secret as text (point 3), and refuse an `Idempotency-Key` that is not the body's
     `reference`? If it would rather have the key signed too, the scheme becomes `<timestamp>.<key>.<body>`.
  6. **Refusals.** Which statuses mean "this request will never be accepted" and which mean "try later"? That decides
     whether point 6's table holds for its 4xx.
  7. **Network.** Does it allow calls only from known addresses? Then it needs the API's outbound address.
