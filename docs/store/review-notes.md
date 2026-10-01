# App review notes

The app is a private members’ concierge. It does **not** book or take payment. A reviewer needs a real account.

## Demo account

Create it against the environment under review:

```bash
cd /opt/bbc/infra && docker compose -f docker-compose.yml -f compose.prod.yml --env-file env/production.env run --rm --no-deps api bun run scripts/seed-review-account.ts
```

Requires `REVIEW_ACCOUNT_EMAIL` and `REVIEW_ACCOUNT_PASSWORD` from the environment (`packages/shared/src/env.ts`). The script is idempotent: if the email already exists it exits. Put the credentials in App Store Connect and Play Console **only**. Never commit them.

## Path for the reviewer

1. Sign in (`/sign-in`) with the demo email and password.
2. If onboarding appears, set a home airport or skip.
3. Home / Explore (`explore.root`): open a fare card, or search (`explore.search` / `explore.airportQuery`) and open a result.
4. Fare (`fare.root`) → **Request** (`fare.request`) opens the request sheet (`request.sheet`).
5. Fill contact if needed and submit (`request.submit`). That is how a member asks for a quote — there is no separate “I’m interested” API.
6. Open the Requests tab (`requests.root`) to see the new row; tap it for `request.root`.

## Account deletion (as shipped today)

Profile tab → **Delete account** (`profile.delete`) → confirm (`profile.deleteConfirm` / `profile.deleteConfirm.confirm`). The sheet does **not** re-ask the password. `deleteAccount()` in `apps/mobile/src/features/auth/flows.ts:132–136` clears local session (push, queue, onboarded flag) and calls `authClient.deleteUser({})`.

When `feat/new-interior` lands, this path moves to Settings and asks for the password. That PR updates this file.

## What the reviewer will not find

Booking, checkout, Apple Pay / Play Billing, in-app search of the public web, Face ID, or a crash-reporter settings screen.
