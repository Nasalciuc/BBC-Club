# ADR-IMPL-011 — Flight contracts: fares, requests, publishedSource

Status: accepted · Date: 2026-09-17 · Supersedes nothing; gates THE BUILD branches 1–5.

**Context.** The app moves from curated proposals to fares and requests. The screens need typed view models before any component can compile, and `packages/shared` is ADR-gated.

**Decision.** Add `api/v1/fares.ts` and `api/v1/requests.ts` to `packages/shared`, extend the existing `PricePair` with `publishedSource`, and add four permission groups (`fares`, `requests`, `campaigns`, `catalog`) to `statement`. The shapes are defined once and read by the API, the app and the tests.

**Consequence.** `FareVM.departAt` is optional, because the fare source may return route prices without times; the row renders "from $X" in that case rather than inventing a departure.
