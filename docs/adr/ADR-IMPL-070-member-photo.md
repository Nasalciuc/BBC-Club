# ADR-IMPL-070 — The member's own photo: in Postgres, behind their own session, with the native release

Status: proposed · Date: 2026-10-26 · Scope: `packages/db` (step 0043, its named block, a no-op snapshot sync),
`packages/modules/core/members` (three routes, the photo store, deletion), `packages/shared` (`ProfileVM.photo`,
`media/webp` — AGENTS rule 9: this ADR covers both), `apps/mobile` (the picker, the manipulator, the Photo row, the
portraits), `packages/ui` (a filled camera, `PROFILE_AVATAR`), `DESIGN.md` (one line — rule 9), `design/components.md`,
`docs/store` · Implements decision D9 and brief 3.4 part 2 · Amends ADR-IMPL-056 §5 (the member's photo) and the "not
in this ADR" of ADR-IMPL-055 (the photo, 0.3.0).

**Context.**

- The owner's request 8 asks that a member set their own name and photo. The name shipped first, by OTA (#100). The
  photo needs two native modules, `expo-image-picker` and `expo-image-manipulator`, which no 0.2.0 binary has.
- `members.profile.avatar_url` (0033) holds the https address of a photo hosted elsewhere, and `Avatar` and
  `ProfileHero` draw a portrait from it. No route writes it: there was nowhere to host an upload. MinIO is not served
  publicly (`/media/*` answers 404, ADR-IMPL-047) and stays closed until R1b.
- D9 (the five-expert review, unanimous): the photo lives in Postgres — 512 px WebP, at most 100 KB, behind an
  authenticated route with an ETag, deleted with the account; only the member sees it. Postgres is already backed up,
  private, and cleared with the member.
- D4: whatever needs a native module ships in one native release (0.3.0); `runtimeVersion` follows `appVersion`. Until
  then an update over the air can carry this JavaScript to 0.2.0 binaries, where the picker's package would crash as it
  loads: it asks the runtime for its native module at import.

**Decision.**

1. **The image in Postgres, one row per member** — `members.profile_photo` (step 0043): `member_id` (PK, FK to
   `members.profile` ON DELETE CASCADE), `image bytea`, `byte_size`, `sha256`, `created_at`, `updated_at` (with 0001's
   trigger). CHECKs keep what Postgres can see: the RIFF/WEBP container, 1 B to 100 KB with `byte_size` the bytes' own,
   and `sha256 = encode(sha256(image), 'hex')` — an ETag can never describe other bytes. The column is
   `STORAGE EXTERNAL`: a WebP is compressed already. No URL is stored and none exists: `avatar_url` keeps its meaning
   (an address hosted elsewhere) and its CHECK.
2. **The photo the club takes: a still WebP, exactly 512 × 512, at most 100 KB, without metadata.** One size, not "at
   most 512": the app always makes 512 (it crops square and resizes, up or down), the check stays one comparison, and
   512 px covers the largest portrait (Profile's 113.6 pt is 341 px at 3×). No EXIF, XMP or ICC profile, as a chunk or
   as a `VP8X` flag; no animation; nothing but `VP8X`, `ALPH`, `VP8 `/`VP8L`; a container that holds together (the RIFF
   size is the file's, no chunk runs past it). `@bbc/shared/media/webp` reads the container and the picture's header
   only — the server never decodes an image — so the same `checkPhotoWebp` runs in the app before it sends and on the
   server before it writes, and `stripWebpMetadata` lets the app drop what a platform's encoder adds.
3. **Three routes, in the members module, the actor from the session only** (rule 2; there is no id in any of them):
   - `PUT /v1/profile/photo` — the body is the photo (`image/webp`). Another type → 415, over 100 KB → 413 (the route's
     own limit; over the host's 256 KB, the host's 413), anything else the check refuses → 400; each `VALIDATION`
     with a calm message and `context.problem` (`type`, `size`, `format`, `metadata`, `animation`, `dimensions`).
     Never 500 on bad input. The photo there was stays. An upload before `member.registered` is delivered makes the
     profile row as every profile write does (`writeOrCreate`). Answers the whole `ProfileVM` (ADR-IMPL-058).
   - `GET /v1/profile/photo` — the caller's own, `image/webp`, a strong `ETag` (the sha256), and the headers of every
     per-member answer (`private, no-cache` and `Vary: Cookie, Authorization`, as Home's in `http-cache.ts`: no shared
     cache may hand one member's photo to another); `If-None-Match` → 304 without reading the bytes; none → 404, as for
     a member who never had one.
   - `DELETE /v1/profile/photo` — the initials again; the same answer twice. Answers the whole `ProfileVM`.

   PUT and DELETE authorize before they count, then count in `profile.write`'s numbers in a bucket of their own
   (`photo:<member>`, as the password's `pw:`): choosing a photo again never uses up the member's other saves, nor an
   anonymous caller anyone's. GET is a `read`. Each change publishes `member.profile_updated` with `fields: ["photo"]` —
   never the bytes, which are in no event, log or journal.

4. **How the app learns there is one:** `ProfileVM.photo: { etag } | null`, optional both ways and `.catch(null)` like
   `avatarUrl` — an older app drops it, a newer app reads an older server's profile as none. `getProfile` reads the tag
   in the profile's own query; the bytes only ever travel through GET /v1/profile/photo.
5. **Deleted with the account.** `member.deleted` deletes the photo by name, then the profile (whose FK would take the
   photo anyway); delivered twice, the second run deletes nothing. `apps/api/test/delete.test.ts` names
   `profile_photo` (db:verify rule 12) and counts zero rows after a deletion.
6. **The app.** Edit profile has a `Photo` row under `Name` (36 draws neither; both in 36's look), with a filled camera
   (Lucide's `camera`, filled like 36's other marks). Its sheet shows the portrait as Profile does, says what the photo
   is for and who sees it, and offers `Choose a photo` (one filled pill) and, once there is one, `Remove photo` (a slate
   text button — red is only for Sign out, Delete account and errors). Choosing opens the system's photo library with
   its square crop (no camera, no permission asked: the system picker hands back only the photo chosen); the app crops
   square again in case the platform left a pixel off, resizes to 512 × 512, saves WebP at the best of 0.85, 0.75 …
   0.35 that weighs at most 100 KB, strips the metadata, checks it as the server will, and sends it. The answer is the
   member's profile on every screen at once (profile-store.ts). Explore's greeting and Profile show the photo through
   `Avatar`: GET /v1/profile/photo with the session's own headers and the tag in the address, so a phone keeps each
   photo once and asks again only when the tag changes; else `avatarUrl`; else the initials.
7. **The native gate (D4).** Nothing imports `expo-image-picker` or `expo-image-manipulator` but
   `features/profile/photo-native.ts`, and it loads them only with `import()` after `photoPickerReady` —
   `requireOptionalNativeModule` for both modules, asked once. `photo-guard.test.ts` holds the whole app to that and
   checks the module names against the packages' own. On a 0.2.0 binary that receives this JavaScript over the air,
   both lookups answer null: Edit profile has no Photo row and the picker's code never loads. Portraits still show a
   photo added from a newer build (`expo-image` is in 0.2.0). The app config gains the picker's plugin with the camera
   and the microphone blocked (`cameraPermission: false`, `microphonePermission: false`) and a calm photos text.
   This PR does not bump `version`: the native release PR (0.3.0, D4) does, with the other native items.

**Consequences.**

- At most 100 KB a member: 10,000 members with a photo are at most about 1 GB in the database and in its backups
  (pgBackRest, the restore drill); typical photos are 20–60 KB. The bytes are out of line (TOAST) and read only by GET
  /v1/profile/photo, so profile reads stay as fast as they were (one LEFT JOIN on the primary key for the tag).
- A photo leaves the app only as a 512-px WebP without metadata — no place, time or camera — and only its member can
  read it. It is deleted with the account. The stores' declarations change: photos are collected, optional, linked to
  the member, for app functionality, not shared (`docs/store/data-safety.md`, `docs/store/app-privacy.md`).
- `DESIGN.md` says the member's own photo shows when they add one, seen only by them; `design/components.md`'s
  `Avatar` says how it is asked for.
- Conflicts reported, not resolved silently: 36 draws no `Photo` row and no photo sheet (as it drew no `Name` row) —
  both are built from 36's look and the profile's sheets; the camera glyph is Lucide's, filled, since no image draws
  one to trace. The brief quoted `DESIGN.md` as "no member photo until the club keeps them"; the line on this branch
  read "the member's photo only where the club has them (ADR-IMPL-056 §5)", and it is that line which changes.

**Left to the owner.**

- The native release (0.3.0, D4): an EAS build for Android (and iOS once the Apple account exists) with these two
  modules; until it is installed, no member sees the Photo row.
- The photos text (`apps/mobile/app.json`, `photosPermission`) — iOS shows it if the app ever asks for the library; the
  Play Console's Data safety form and the App Store's privacy labels, as the two store files now say.
- The D1 check on a device: an upload under 5 s on Wi-Fi, stored at most 100 KB, no EXIF (the server refuses any), gone
  after account deletion (a test).
