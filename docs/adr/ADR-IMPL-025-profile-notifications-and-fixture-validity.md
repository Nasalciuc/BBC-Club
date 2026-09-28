# ADR-IMPL-025 — The fixture stays valid past the nightly run

Status: accepted · Date: 2026-09-28 · Amends nothing. `packages/shared` is ADR-gated (`fixture.ts`).

**Context.** The nightly Maestro run (`e2e-android.yml`) taps fixture fare `…fa01` in `search-and-request.yaml`, and `apps/api/test/parity.test.ts` seeds the fixture's London offer with its own `validUntil`. Both were valid until **2026-10-04**. After that date the catalog hides the fare (`valid_until > now()`) and the feed hides the offer, so the nightly run and the parity test would turn red for a reason unrelated to the code — before this PR could merge.

**Decision.**

2. `fa01` and the London offer are valid until **2027-12-31**, everywhere the date is encoded (`packages/shared/src/fixture.ts` and the catalog clock test's copy of fa01). The other fixture validities (fa02 and the seeded fa07 on 2026-10-04; the rest between 2026-10-31 and 2026-12-15) are left as they are: no flow and no test depends on them. The follow-up is to express fixture validity relative to the seed date instead of as calendar dates.

**Consequence.** Gate B and every nightly run until the end of 2027 use a fare that exists. The JFK → LHR list shows one fare instead of three after 2026-10-04 in a freshly seeded environment; no assertion counts them.
