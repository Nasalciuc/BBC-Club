# ADR-IMPL-019 — Flight clocks are local to the airport, not the phone

Status: accepted · Date: 2026-09-25 · Amends nothing. ADR-IMPL-011 still describes `departAt` as optional UTC. `packages/shared` is ADR-gated (`FareVM`).

**Context.** `FareVM.departAt` / `arriveAt` are UTC instants. The row and the fare screen formatted them with `toLocaleTimeString`, so a member in Chișinău and a member in Los Angeles saw different clocks for the same JFK–LHR departure. Airports had no IANA zone, so the mapper could not emit a local wall clock.

**Decision.**

1. `catalog.airports.tz` is an IANA zone (expand-only, default `UTC`). Seed `airports.csv` carries `tz`. Every value must be in `Intl.supportedValuesOf("timeZone")`.
2. `FareVM` grows `departLocal`, `arriveLocal` (nullable `HH:mm`) and `arriveDayOffset` (0–2). The mapper computes them with `Intl.DateTimeFormat("en-GB", { timeZone, hourCycle: "h23" })` at the origin and destination airports. It never reads the host TZ.
3. UI (`fareFacts`, fare detail) renders those fields. Flight times do not call `toLocaleTimeString`.

**Consequence.** fa01 (JFK 18:55 → LHR 07:00 +1) is the same string on every phone. A regression that puts `toLocaleTimeString` back fails the Chișinău vs Los Angeles test.
