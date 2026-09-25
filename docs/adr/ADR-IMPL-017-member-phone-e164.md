# ADR-IMPL-017 — Member phone is E.164 on profile patch

Status: accepted · Date: 2026-09-25 · Amends ADR-IMPL-015 (ProfileVM / profile patch). `packages/shared` is ADR-gated.

**Context.** `RequestBody.contact.phone` already required a valid member phone (`isMemberPhone` → E.164). `ProfilePatchBody.phone` was `z.string().min(1).max(30)` and accepted bare digit junk (e.g. a national number typed without a country prefix). The advisor cannot call that. Mobile `validatePhone` defaulted to US, so a Moldova/Romania national number failed Save.

**Decision.**

1. `ProfilePatchBody.phone` uses the same `isMemberPhone` refine as request contact. The client sends E.164; the API refuses anything `parseMemberPhone` does not accept.
2. `parseMemberPhone` in `packages/shared/src/phone.ts` is the single parse. Mobile `validatePhone` delegates to it and takes a club country so the prefix UI can send a national number plus `defaultCountry`.
3. The app stores E.164. Edit sheets split a stored value into country + national for the prefix control. Club country list is a frequent-routes subset, not every ISO country.

**Consequence.** Profile and request agree on what a phone is. A national number without a chosen country still fails — that is intended. Bare `max(30)` digit strings no longer persist.
