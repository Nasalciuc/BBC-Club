import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ModuleDescriptor, HandlerContext } from "@bbc/shared/module-contract";
import { rateLimit, subjectOf, routeGate } from "@bbc/platform/ratelimit";
import { apiError } from "@bbc/shared/errors";
import { actorMemberId } from "@bbc/shared/authz/principal";
import type { AppEnv } from "@bbc/shared/http/app-env";
import { createMembersFacade, toProfileVM } from "./application/facade";
import { createPhotoStore } from "./application/photo";
import type { MembersFacade, ProfileCreationDeps } from "./api";
import type { CrmFacade } from "@bbc/crm";
import type { IdentityFacade } from "@bbc/identity";
import { onMemberRegistered, reconcileMissingProfiles } from "./handlers/on-member-registered";
import { onMemberDeleted } from "./handlers/on-member-deleted";
import { ProfilePatchBody, NotificationPreferencesBody, TravelPreferencesBody } from "@bbc/shared/api/v1/proposals";
import { event } from "@bbc/shared/events";
import type { Executor } from "@bbc/db";
import { withTx } from "@bbc/db";
import type { Principal } from "@bbc/shared/authz/principal";
import { PHOTO_CONTENT_TYPE, PHOTO_MAX_BYTES, checkPhotoWebp, type PhotoProblem } from "@bbc/shared/media/webp";

type Ports = {
  crm: CrmFacade;
  identity: IdentityFacade;
};

function memberEmail(p: Principal): string | null {
  return p.kind === "member" ? p.email : null;
}

/**
 * GET /v1/profile/photo's headers (ADR-IMPL-070), as every per-member answer's (the host's http-cache.ts): `private,
 * no-cache` — a phone keeps the bytes but asks again, and the strong ETag's 304 spares it them; no shared cache may serve
 * one member's photo to another. `Vary` names what the answer depends on.
 */
const PHOTO_CACHE = { "Cache-Control": "private, no-cache", Vary: "Cookie, Authorization" } as const;

/** If-None-Match as RFC 9110 §13.1.2 reads it: `*`, or a list of tags compared weakly. */
function ifNoneMatchHits(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  const opaque = (tag: string) => tag.trim().replace(/^W\//, "");
  return header.split(",").some((tag) => tag.trim() === "*" || opaque(tag) === etag);
}

/** What the member is told when a photo is refused, by why (the app sends only what passes the same check). */
const PHOTO_REFUSED: Record<PhotoProblem | "type", string> = {
  type: "Send the photo as a WebP image.",
  size: "This photo is too large. Choose it again so the app can make it smaller.",
  format: "This photo could not be read. Choose another one.",
  metadata: "This photo still carries details from the camera. Choose it again so the app can remove them.",
  animation: "A moving picture cannot be your photo. Choose a still one.",
  dimensions: "Your photo is 512 by 512 pixels. Choose it again so the app can size it.",
};

export const membersModule = (): ModuleDescriptor<Ports, MembersFacade> => ({
  name: "members",
  layer: "core",
  needs: ["crm", "identity"],
  init: ({ db, platform, ports }) => {
    const conn = db as unknown as Executor;
    const facade = createMembersFacade(conn);
    const publish = async (
      tx: Executor,
      e: {
        type: string;
        version: number;
        aggregateType: string;
        aggregateId: string;
        memberId: string | null;
        payload: unknown;
      },
    ): Promise<void> => {
      await platform.events.publish(tx, { ...e, publishedBy: "members" });
    };

    // ADR-PROD-001: seeded false by scripts/seed-flags.ts — an unknown CRM email is waitlist.
    const profileCreation: ProfileCreationDeps = {
      crm: ports.crm,
      flags: { get: (k: string) => platform.flags.isEnabled(k, false) },
    };

    /** Right after the join code the profile row is not there until member.registered is delivered, and onboarding's
     *  first save answered 404 'Not found.'. When the write finds no row and the account still exists, make the row the
     *  delivery would make (`ensureProfile`) and write once more; still none (a deleted profile) → null → 404.
     *  The account is asked of identity, not read from the principal: a member deleted on another device keeps a
     *  session in the cookie cache for up to a minute, and a save from it must not bring back, active and linked to
     *  the CRM, the profile member.deleted erased (nothing would erase it again). */
    async function writeOrCreate<T>(tx: Executor, actor: string, write: () => Promise<T | null>): Promise<T | null> {
      const first = await write();
      if (first) return first;
      const email = await ports.identity.registeredEmail(actor);
      if (!email) return null;
      await facade.ensureProfile(tx, actor, email, profileCreation);
      return write();
    }

    const routes = new Hono<AppEnv>();
    // ADR-IMPL-075: each route's permission, rate rule and kill flags, declared once beside its path.
    const gate = routeGate(platform, "members").on(routes, "/v1");

    gate.patch("/profile", { permission: "profile:update-self", rate: "profile.write" }, async (c) => {
      const principal = c.get("principal");
      const actor = actorMemberId(principal);
      if (!actor) return c.json(apiError("FORBIDDEN"), 403);
      const parsed = ProfilePatchBody.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json(
          apiError("VALIDATION", {
            details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          }),
          400,
        );
      }
      const updated = await withTx(conn, async (tx) => {
        const p = await writeOrCreate(tx, actor, () => facade.updateProfile(tx, actor, parsed.data));
        if (!p) return null;
        const fields = Object.keys(parsed.data);
        await publish(tx, {
          type: "member.profile_updated",
          version: 1,
          aggregateType: "member",
          aggregateId: actor,
          memberId: actor,
          payload: event("member.profile_updated", {
            memberId: actor,
            fields,
            updatedAt: new Date().toISOString(),
          }),
        });
        return p;
      });
      if (!updated) return c.json(apiError("NOT_FOUND"), 404);
      // The ProfileVM GET answers, as the travel save does: email and notifications included (ADR-IMPL-025).
      const prefs = await facade.preferencesOf(undefined, actor);
      return c.json(toProfileVM(updated, memberEmail(principal), actor, prefs));
    });

    gate.put("/profile/travel", { permission: "profile:update-self", rate: "profile.write" }, async (c) => {
      const principal = c.get("principal");
      const actor = actorMemberId(principal);
      if (!actor) return c.json(apiError("FORBIDDEN"), 403);
      const parsed = TravelPreferencesBody.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json(
          apiError("VALIDATION", {
            details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          }),
          400,
        );
      }
      const updated = await withTx(conn, async (tx) => {
        const p = await writeOrCreate(tx, actor, () => facade.setTravelPreferences(tx, actor, parsed.data));
        if (!p) return null;
        await publish(tx, {
          type: "member.profile_updated",
          version: 1,
          aggregateType: "member",
          aggregateId: actor,
          memberId: actor,
          payload: event("member.profile_updated", {
            memberId: actor,
            fields: Object.keys(parsed.data),
            updatedAt: new Date().toISOString(),
          }),
        });
        return p;
      });
      if (!updated) return c.json(apiError("NOT_FOUND"), 404);
      const prefs = await facade.preferencesOf(undefined, actor);
      return c.json(toProfileVM(updated, memberEmail(principal), actor, prefs));
    });

    gate.put("/profile/preferences", { permission: "inbox:manage-preferences", rate: "profile.write" }, async (c) => {
      const actor = actorMemberId(c.get("principal"));
      if (!actor) return c.json(apiError("FORBIDDEN"), 403);
      const parsed = NotificationPreferencesBody.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json(
          apiError("VALIDATION", {
            details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          }),
          400,
        );
      }
      await facade.setNotificationPreferences(undefined, actor, parsed.data.preferences);
      return c.json({ ok: true });
    });

    // ── The member's own photo (ADR-IMPL-070, D9): the bytes in Postgres, only ever the caller's. ────────────────────
    const photos = createPhotoStore(conn);
    const photoRefused = (problem: PhotoProblem | "type") =>
      apiError("VALIDATION", { message: PHOTO_REFUSED[problem], context: { problem } });
    const photoSaved = async (tx: Executor, actor: string) =>
      publish(tx, {
        type: "member.profile_updated",
        version: 1,
        aggregateType: "member",
        aggregateId: actor,
        memberId: actor,
        payload: event("member.profile_updated", {
          memberId: actor,
          fields: ["photo"],
          updatedAt: new Date().toISOString(),
        }),
      });

    // Only the caller's, with its strong ETag (the bytes' sha256): If-None-Match → 304 without reading the bytes. None
    // — 404, the same answer as a member who never had one.
    gate.get("/profile/photo", { permission: "profile:read-self", rate: "read" }, async (c) => {
      const actor = actorMemberId(c.get("principal"));
      if (!actor) return c.json(apiError("FORBIDDEN"), 403);
      const current = await photos.etagOf(undefined, actor);
      if (!current) return c.json(apiError("NOT_FOUND"), 404);
      const etag = `"${current}"`;
      if (ifNoneMatchHits(c.req.header("If-None-Match"), etag)) {
        return c.body(null, 304, { ETag: etag, ...PHOTO_CACHE });
      }
      const photo = await photos.read(undefined, actor);
      if (!photo) return c.json(apiError("NOT_FOUND"), 404);
      return c.body(photo.image, 200, {
        "Content-Type": PHOTO_CONTENT_TYPE,
        ETag: `"${photo.etag}"`,
        ...PHOTO_CACHE,
      });
    });

    // The photo itself as the body (image/webp, at most 100 KB): checked whole before anything is written — a WebP,
    // 512 × 512, still, without EXIF, XMP or an ICC profile. Anything else is the member's to fix: 400 (415 for another
    // type, 413 over the size), never 500. Answers the whole profile, as every profile write does (ADR-IMPL-058).
    // The member is known before anything counts, and photos have profile.write's numbers in a bucket of their own (as
    // the password has): choosing a photo again does not use up the member's other profile saves.
    const photoLimit = rateLimit(platform.rateLimit, "profile.write", (c) => `photo:${subjectOf(c)}`);
    const photoBodyLimit = bodyLimit({ maxSize: PHOTO_MAX_BYTES, onError: (c) => c.json(photoRefused("size"), 413) });
    gate.put(
      "/profile/photo",
      { permission: "profile:update-self", rate: "profile.write", rateBy: "route" },
      photoLimit,
      async (c, next) => {
        const type = (c.req.header("Content-Type") ?? "").split(";")[0]?.trim().toLowerCase();
        if (type !== PHOTO_CONTENT_TYPE) return c.json(photoRefused("type"), 415);
        return photoBodyLimit(c, next);
      },
      async (c) => {
        const principal = c.get("principal");
        const actor = actorMemberId(principal);
        if (!actor) return c.json(apiError("FORBIDDEN"), 403);
        const image = new Uint8Array(await c.req.arrayBuffer());
        const checked = checkPhotoWebp(image);
        if (!checked.ok) return c.json(photoRefused(checked.problem), checked.problem === "size" ? 413 : 400);
        const updated = await withTx(conn, async (tx) => {
          const p = await writeOrCreate(tx, actor, async () =>
            (await photos.write(tx, actor, image)) ? facade.getProfile(tx, actor) : null,
          );
          if (!p) return null;
          await photoSaved(tx, actor);
          return p;
        });
        if (!updated) return c.json(apiError("NOT_FOUND"), 404);
        const prefs = await facade.preferencesOf(undefined, actor);
        return c.json(toProfileVM(updated, memberEmail(principal), actor, prefs));
      },
    );

    // Takes the photo away: the initials again. Asked twice, the second finds none and says the same. Answers the whole
    // profile.
    gate.delete(
      "/profile/photo",
      { permission: "profile:update-self", rate: "profile.write", rateBy: "route" },
      photoLimit,
      async (c) => {
        const principal = c.get("principal");
        const actor = actorMemberId(principal);
        if (!actor) return c.json(apiError("FORBIDDEN"), 403);
        const p = await withTx(conn, async (tx) => {
          if (await photos.remove(tx, actor)) await photoSaved(tx, actor);
          return facade.getProfile(tx, actor);
        });
        const prefs = await facade.preferencesOf(undefined, actor);
        return c.json(toProfileVM(p, memberEmail(principal), actor, prefs));
      },
    );

    return {
      exposes: facade,
      routes: [{ basePath: "/v1", app: routes }],
      consumers: [
        {
          type: "member.registered",
          name: "members.onMemberRegistered",
          handler: (ctx: HandlerContext, payload: unknown) =>
            onMemberRegistered(
              {
                ...profileCreation,
                tx: ctx.tx as unknown as Executor,
                publish: async (e) => {
                  await platform.events.publish(ctx.tx, { ...e, publishedBy: "members" });
                },
              },
              payload,
            ),
        },
        {
          type: "member.deleted",
          name: "members.onMemberDeleted",
          handler: (ctx: HandlerContext, payload: unknown) =>
            onMemberDeleted({ tx: ctx.tx as unknown as Executor }, payload),
        },
        // stage 1: crm.mirror.synced → link waitlist members
      ],
      jobs: [
        {
          name: "reconcile-profiles",
          spec: {
            cron: "*/15 * * * *",
            singleton: true,
            timeoutMs: 120_000,
            handler: async () => ({
              reemitted: await reconcileMissingProfiles({
                db: conn,
                identity: ports.identity,
                publish: async (e) => {
                  await db.transaction((tx: unknown) => platform.events.publish(tx, { ...e, publishedBy: "members" }));
                },
              }),
            }),
          },
        },
      ],
    };
  },
});
