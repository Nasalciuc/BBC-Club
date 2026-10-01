# Google Play Data safety

Same facts as `docs/store/app-privacy.md`, in Play Console language. Update both files together. **No data is sold. No data is used for advertising or tracking. No crash or analytics collection today.**

## Data collected

| Play category            | Data type                | Collected | Optional?                                          | Shared with third parties?                                         | Purpose                                 | Evidence                                                                                                              |
| ------------------------ | ------------------------ | --------- | -------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Personal info            | Name                     | Yes       | Required for a request                             | No (advisor / CRM on our API only)                                 | App functionality                       | Prefill from GET `/v1/profile` (`apps/mobile/src/lib/api.ts:161–174`); sent on POST `/v1/requests` (`api.ts:456–487`) |
| Personal info            | Email                    | Yes       | Required to have an account                        | No                                                                 | App functionality, account management   | Better Auth `client.ts:8–19`; request contact `api.ts:456–487`                                                        |
| Personal info            | Phone                    | Yes       | User can skip until they save it or send a request | No                                                                 | App functionality                       | PATCH `/v1/profile` (`api.ts:177–197`); request contact                                                               |
| Personal info            | User IDs                 | Yes       | Account                                            | No                                                                 | App functionality                       | `memberId` on profile GET; `bbcclub.deviceId` (`push.ts:9–16`)                                                        |
| Location                 | Approximate / precise    | **No**    | —                                                  | —                                                                  | —                                       | Home airport is an IATA code the member picks, not device GPS                                                         |
| Photos and videos        | —                        | **No**    | —                                                  | —                                                                  | —                                       | Remote images only (`expo-image`)                                                                                     |
| Audio files              | —                        | **No**    | —                                                  | —                                                                  | —                                       | —                                                                                                                     |
| Files and docs           | —                        | **No**    | —                                                  | —                                                                  | —                                       | —                                                                                                                     |
| Calendar                 | —                        | **No**    | —                                                  | —                                                                  | —                                       | In-app date picker only                                                                                               |
| Contacts                 | —                        | **No**    | —                                                  | —                                                                  | —                                       | —                                                                                                                     |
| App activity             | In-app search / requests | Yes       | Request is user-initiated                          | No                                                                 | App functionality                       | GET `/v1/search`, `/v1/home`, `/v1/fares/:id`; POST `/v1/requests`                                                    |
| App info and performance | Crash logs / diagnostics | **No**    | —                                                  | —                                                                  | —                                       | No crash SDK                                                                                                          |
| Device or other IDs      | Push token               | Yes       | Asked after the first request (`push.ts:19–23`)    | Expo push service when an Expo token is obtained (`push.ts:49–57`) | App functionality (quote notifications) | POST `/v1/devices` (`api.ts:288–309`)                                                                                 |

## Security

- Data in transit: production API must be `https://` (`apps/mobile/app.config.ts` `assertProductionEnv`).
- Session cookie and device id live in SecureStore (`client.ts:11–16`, `push.ts:9–16`).
- Account deletion: Profile → Delete account → confirm (`apps/mobile/src/app/(tabs)/profile.tsx` `profile.delete` / `profile.deleteConfirm`) → `deleteAccount()` (`flows.ts:132–136`) → `authClient.deleteUser({})`.

## Not collected

Biometrics, advertising ID, installed apps, clipboard, contacts, precise location, crash traces, analytics events.
