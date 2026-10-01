# App Store privacy labels

Derived from the code on this branch. Nothing here is used for tracking. There is **no** crash reporter and **no** analytics SDK today — a later error-reporting PR must update this file.

Apple “linked to the user” = yes for each collected data type (the member session). “Used for tracking” = no.

| Data type                                                  | Collected? | Linked | Tracking | Purpose           | Where the app collects or sends it                                                                                                                                                     |
| ---------------------------------------------------------- | ---------- | ------ | -------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name                                                       | Yes        | Yes    | No       | App functionality | Received on GET `/v1/profile` (`apps/mobile/src/lib/api.ts:161–174`). Sent as request `contact.name` via POST `/v1/requests` (`api.ts:456–487`). The app does not PATCH `displayName`. |
| Email address                                              | Yes        | Yes    | No       | App functionality | Sign-in / join / reset: `apps/mobile/src/features/auth/flows.ts` → Better Auth `/api/auth/*` (`client.ts:8–19`). Also request `contact.email` (`api.ts:456–487`).                      |
| Phone number                                               | Yes        | Yes    | No       | App functionality | PATCH `/v1/profile` (`api.ts:177–197`); request `contact.phone` (`api.ts:456–487`).                                                                                                    |
| Other user content — home airport                          | Yes        | Yes    | No       | App functionality | PATCH `/v1/profile` from onboarding / HomeAirportSheet (`api.ts:177–197`).                                                                                                             |
| Other user content — travel cabin / adults                 | Yes        | Yes    | No       | App functionality | PUT `/v1/profile/travel` (`api.ts:201–221`). Schema also allows destinations / frequency / notes; **the app never sends those**.                                                       |
| Other user content — fare request                          | Yes        | Yes    | No       | App functionality | POST `/v1/requests` (`api.ts:456–487`): legs, cabin, passengers, contact, optional note. Offline copy in MMKV `bbc-request-queue` (`apps/mobile/src/lib/queue.ts`).                    |
| User ID                                                    | Yes        | Yes    | No       | App functionality | `memberId` received on GET `/v1/profile` (`api.ts:161–174`). Not sent as a client-chosen id.                                                                                           |
| Device ID                                                  | Yes        | Yes    | No       | App functionality | Stable `bbcclub.deviceId` in SecureStore (`apps/mobile/src/lib/push.ts:9–16`). POST `/v1/devices` (`api.ts:288–309`) with native / Expo push tokens.                                   |
| Product interaction / advertising / analytics / crash data | **No**     | —      | —        | —                 | No Sentry, Mixpanel, Firebase Analytics, or similar in `apps/mobile`.                                                                                                                  |
| Precise / coarse location                                  | **No**     | —      | —        | —                 | Airport coordinates come from the API for map pins, not from device GPS.                                                                                                               |
| Photos, contacts, clipboard, biometrics                    | **No**     | —      | —        | —                 | `expo-local-authentication` was removed. No contacts / camera / clipboard APIs.                                                                                                        |

## Stored on device

| What                                                                                  | Store                    | File                                            |
| ------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------- |
| Session cookie (`bbcclub` / `bbc`)                                                    | SecureStore              | `apps/mobile/src/features/auth/client.ts:11–16` |
| Push `deviceId`                                                                       | SecureStore              | `apps/mobile/src/lib/push.ts:9–16`              |
| Onboarded / pending-password state flag (a boolean — never the password) / push-asked | MMKV `bbc-app`           | `apps/mobile/src/lib/storage-keys.ts:4–13`      |
| Offline request queue (full request body)                                             | MMKV `bbc-request-queue` | `apps/mobile/src/lib/queue.ts`                  |

OTP and passwords are not written to SecureStore or MMKV. OTP is not placed in route params.
