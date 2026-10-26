import { Hono, type Context } from "hono";
import { z } from "zod";
import type { ModuleDescriptor, HandlerContext } from "@bbc/shared/module-contract";
import { authorize, registerRoute } from "@bbc/shared/authz/authorize";
import { rateLimit } from "@bbc/platform/ratelimit";
import { apiError, zodFieldErrors } from "@bbc/shared/errors";
import { actorMemberId } from "@bbc/shared/authz/principal";
import type { AppEnv } from "@bbc/shared/http/app-env";
import { RequestSubmittedV1 } from "@bbc/shared/events/request";
import { errorForLog, type Executor } from "@bbc/db";
import { createRequestsRepo } from "./infrastructure/requests.repo";
import { submit } from "./application/submit";
import { setStatus } from "./application/set-status";
import { effectiveIntent } from "./application/intent";
import { actionLabel, escapeHtml, routeLabel, verifyAction } from "./application/operator-links";
import { toRequestVM } from "./application/to-request-vm";
import { destinationCities, routeEnds } from "./application/route";
import { askEstimate } from "./application/estimate";
import { askFare } from "./application/published";
import { askOffer, OFFER_TIMEOUT_MS } from "./application/offer";
import { askWithin } from "./application/ask-within";
import { createSendRequestsJob, type OfferForCrm } from "./jobs/send-requests";
import { onMemberDeleted } from "./handlers/on-member-deleted";
import type { RequestsFacade } from "./api";
import type { CrmFacade } from "@bbc/crm";
import type { CatalogFacade } from "@bbc/catalog";
import type { ProposalsFacade } from "@bbc/proposals";

const RequestId = z.string().uuid();
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,200}$/;

type Ports = {
  crm: CrmFacade;
  /** The estimate a quote's search showed (ADR-IMPL-042) — a question, asked through the catalog's facade. */
  catalog: CatalogFacade;
  /** Whether the offer a request names is one the member could see (same layer). */
  proposals: ProposalsFacade;
};

export const requestsModule = (): ModuleDescriptor<Ports, RequestsFacade> => ({
  name: "requests",
  layer: "domain",
  needs: ["crm", "catalog", "proposals"],
  init: ({ db, platform, ports, env }) => {
    const conn = db as unknown as Executor;
    const repo = createRequestsRepo(conn);
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
      await platform.events.publish(tx, { ...e, publishedBy: "requests" });
    };
    const expose = facade(conn, repo);
    // The destination's city for each request's title — one batched airport read per page, never fatal.
    const citiesFor = (rows: readonly { legs: unknown; tripType: string }[]) =>
      destinationCities(
        rows,
        (codes) => ports.catalog.getAirports(undefined, codes),
        (err) => {
          platform.metrics.inc("request_cities_unavailable");
          platform.logger.warn({ err: errorForLog(err) }, "request cities unavailable");
        },
      );
    const cityOf = (cities: Map<string, string>, row: { legs: unknown; tripType: string }) => {
      const to = routeEnds(row.legs, row.tripType)?.to;
      return (to && cities.get(to)) || null;
    };
    // An estimate decorates a request; it never decides whether one is accepted. A failed, slow or malformed answer is
    // counted and logged, and the request goes through without it (application/estimate.ts).
    const indicative = (q: { from: string; to: string; cabin: "business" | "first" }) =>
      askEstimate(() => ports.catalog.indicativeFor(undefined, q), {
        unavailable: (reason, err) => {
          platform.metrics.inc("request_estimates_unavailable", { reason });
          // errorForLog (AGENTS.md rule 6): a failed query's message holds its parameters.
          platform.logger.warn(
            { reason, err: err === undefined ? undefined : errorForLog(err) },
            "request estimate unavailable",
          );
        },
      });
    // What a fare request records of its fare — the published price (ADR-IMPL-046) and the airline (ADR-IMPL-056): one
    // read by key, never fatal — an error or an answer slower than a second is counted and logged (under the published
    // price's metric, which counts every failed fare read), and the request goes through without either.
    const fare = (fareId: string, priceAtRequest: number | undefined) =>
      askFare(() => ports.catalog.getFare(undefined, fareId), priceAtRequest, {
        unavailable: (reason, err) => {
          platform.metrics.inc("request_published_unavailable", { reason });
          platform.logger.warn(
            { reason, err: err === undefined ? undefined : errorForLog(err) },
            "request published fare unavailable",
          );
        },
      });
    // Whether the member could have seen the offer a request names: two reads by key from proposals, never fatal — a
    // failed or slow read checks nothing (counted and logged), and the request goes through.
    const offer = (offerId: string, memberId: string | null) =>
      askOffer(
        {
          visible: () => (memberId ? ports.proposals.getVisible(undefined, memberId, offerId) : Promise.resolve(null)),
          stored: () => ports.proposals.getAny(undefined, offerId),
          memberId,
        },
        {
          unavailable: (reason, err) => {
            platform.metrics.inc("request_offer_unavailable", { reason });
            platform.logger.warn(
              { reason, err: err === undefined ? undefined : errorForLog(err) },
              "request offer unavailable",
            );
          },
        },
      );
    // The offer an offer request names, as the specialist reads it when the request is sent (system scope): one read,
    // never fatal — an error or a slow answer sends the request without it.
    const offerForCrm = async (offerId: string): Promise<OfferForCrm | null> => {
      const answer = await askWithin(
        () => ports.proposals.getAny(undefined, offerId),
        OFFER_TIMEOUT_MS,
        (reason, err) => {
          platform.metrics.inc("request_offer_unavailable", { reason });
          platform.logger.warn(
            { reason, err: err === undefined ? undefined : errorForLog(err) },
            "request offer unavailable",
          );
        },
      );
      const o = answer?.value;
      const amount = o ? Number(o.price) : NaN;
      if (!o || !Number.isFinite(amount)) return null;
      return { id: o.id, title: o.title, price: { amount, currency: o.currency } };
    };
    // One line to the ops channel (OPS_WEBHOOK, as the worker's DB alerts); a failed post is logged, never thrown.
    const notifyOps = async (text: string) => {
      const hook = env.OPS_WEBHOOK;
      if (!hook) {
        platform.logger.warn({ text }, "ops alert (OPS_WEBHOOK unset — not posted)");
        return;
      }
      try {
        const res = await fetch(hook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: `[bbc requests] ${text}` }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) platform.logger.warn({ status: res.status }, "ops alert not posted");
      } catch (err) {
        platform.logger.warn({ err: errorForLog(err) }, "ops alert not posted");
      }
    };

    const routes = new Hono<AppEnv>();

    registerRoute("POST", "/v1/requests", "requests:create");
    routes.post(
      "/requests",
      authorize("requests:create", {
        module: "requests",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const key = c.req.header("Idempotency-Key");
        if (!key) return c.json(apiError("VALIDATION", { message: "Idempotency-Key is required" }), 400);
        // The app sends a UUID. A key past ~2 700 bytes cannot enter the requests_idempotency index (a 500).
        if (!IDEMPOTENCY_KEY.test(key)) {
          return c.json(
            apiError("VALIDATION", { message: "Idempotency-Key must be 8-200 letters, digits, - or _." }),
            400,
          );
        }

        const principal = c.get("principal");
        const platformHdr = (c.req.header("X-App-Platform") ?? "ios").toLowerCase();
        const actor = {
          memberId: actorMemberId(principal),
          source: (platformHdr === "android" ? "android" : "ios") as "ios" | "android",
          appVersion: c.req.header("X-App-Version") ?? null,
          ip: c.get("clientIp"),
        };

        const body = await c.req.json().catch(() => ({}));
        let result;
        try {
          result = await submit(conn, body, actor, key, {
            publish,
            rateLimit: platform.rateLimit,
            indicative,
            fare,
            offer,
          });
        } catch (err: unknown) {
          const details = zodFieldErrors(err);
          if (details) {
            // A refusal an app on phones can meet (a remembered day now past, a leg that goes nowhere, more infants than
            // adults) says why: its own message, which an older app shows as it is, and its reason, which a newer one
            // maps (REQUEST_REFUSAL_REASONS, ADR-IMPL-071). Validation is unchanged.
            const why = details.find((d) => d.reason);
            return c.json(
              apiError("VALIDATION", {
                details,
                ...(why ? { message: why.message, context: { reason: why.reason } } : {}),
              }),
              400,
            );
          }
          throw err;
        }
        if (!result.ok) {
          if (result.code === "RATE_LIMITED") {
            c.header("Retry-After", String(Math.max(1, Math.ceil((result.retryAfterMs ?? 1000) / 1000))));
            // Which limit: the address's, shared with others behind it, or the member's own.
            return c.json(apiError("RATE_LIMITED", { context: { scope: result.scope } }), 429);
          }
          if (result.code === "CONFLICT") return c.json(apiError("CONFLICT"), 409);
          // The fare or offer it names, with the field: `fareId`, `legs.0`, `cabin`, `offerId`.
          if ("details" in result) {
            return c.json(apiError("VALIDATION", { message: result.message, details: result.details }), 400);
          }
          return c.json(apiError("VALIDATION"), 400);
        }
        const created = result.request;
        // Counted once the row exists (a replay or a lost race stores nothing new): estimates that reached a request.
        if (result.created && created.shownEstimateAmount !== null) {
          platform.metrics.inc("request_estimates_stored", { cabin: created.cabin });
        }
        // Taken for its trip without the fare it named, which no longer exists (a request queued before 0034 removed it).
        if (result.created && "fareLeftOut" in result && result.fareLeftOut) {
          platform.metrics.inc("request_fare_gone");
          platform.logger.info(
            { requestId: created.id, fareId: result.fareLeftOut },
            "request taken without its fare: the fare no longer exists",
          );
        }
        return c.json(
          toRequestVM(created, [], cityOf(await citiesFor([created]), created)),
          result.created ? 201 : 200,
        );
      },
    );

    registerRoute("GET", "/v1/requests", "requests:read-self", "read");
    routes.get(
      "/requests",
      rateLimit(platform.rateLimit, "read"),
      authorize("requests:read-self", {
        module: "requests",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const memberId = actorMemberId(c.get("principal"));
        if (!memberId) return c.json(apiError("FORBIDDEN"), 403);
        const rows = await repo.listForMember(undefined, memberId);
        const page = rows.slice(0, 50);
        const [timelines, cities] = await Promise.all([
          repo.timelinesFor(
            undefined,
            page.map((r) => r.id),
          ),
          citiesFor(page),
        ]);
        return c.json({
          items: page.map((r) => toRequestVM(r, timelines.get(r.id) ?? [], cityOf(cities, r))),
          hasMore: rows.length > 50,
        });
      },
    );

    registerRoute("GET", "/v1/requests/:id", "requests:read-self", "read");
    routes.get(
      "/requests/:id",
      rateLimit(platform.rateLimit, "read"),
      authorize("requests:read-self", {
        module: "requests",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const memberId = actorMemberId(c.get("principal"));
        if (!memberId) return c.json(apiError("FORBIDDEN"), 403);
        // An id that is not a UUID names no request (bbcclub://requests/abc): 404, never a cast error from Postgres.
        const id = RequestId.safeParse(c.req.param("id"));
        if (!id.success) return c.json(apiError("NOT_FOUND"), 404);
        const row = await repo.getForMember(undefined, memberId, id.data);
        if (!row) return c.json(apiError("NOT_FOUND"), 404);
        const [timeline, cities] = await Promise.all([repo.timeline(undefined, row.id), citiesFor([row])]);
        return c.json(toRequestVM(row, timeline, cityOf(cities, row)));
      },
    );

    registerRoute("POST", "/v1/internal/requests/:id/status", "requests:update-any");
    routes.post(
      "/internal/requests/:id/status",
      authorize("requests:update-any", {
        module: "requests",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const body = await c.req.json().catch(() => ({}));
        let r;
        try {
          r = await setStatus(conn, { ...body, requestId: c.req.param("id") }, { repo, publish });
        } catch (err: unknown) {
          const details = zodFieldErrors(err);
          if (details) return c.json(apiError("VALIDATION", { details }), 400);
          throw err;
        }
        if (!r.ok) {
          // A step back (booked → quoted) or out of closed: refused, nothing written (set-status.ts).
          if (r.code === "CONFLICT") return c.json(apiError("CONFLICT", { context: { from: r.from, to: r.to } }), 409);
          return c.json(apiError("NOT_FOUND"), 404);
        }
        return c.json({ ok: true, unchanged: r.unchanged });
      },
    );

    return {
      exposes: expose,
      routes: [
        { basePath: "/v1", app: routes },
        { basePath: "/ops", app: opsRoutes(conn, repo, publish, platform, env.OPS_LINK_SECRET ?? "") },
      ],
      consumers: [
        {
          type: "request.submitted",
          name: "requests.onRequestSubmitted",
          /** Records that the request is ready to send. The network call belongs to `send-requests`, which owns
           *  its own connection, its own timeout and its own retry budget. A consumer holds the poller's
           *  transaction: anything slow in here is a connection the rest of the API cannot have. */
          handler: async (ctx: HandlerContext, raw: unknown) => {
            const evt = RequestSubmittedV1.parse(raw);
            ctx.logger.info({ requestId: evt.requestId }, "request queued for CRM");
          },
        },
        {
          type: "member.deleted",
          name: "requests.onMemberDeleted",
          handler: (ctx: HandlerContext) => {
            const memberId = ctx.event.memberId;
            if (!memberId) return Promise.resolve();
            return onMemberDeleted({ tx: ctx.tx as unknown as Executor, memberId });
          },
        },
      ],
      jobs: [
        {
          name: "send-requests",
          spec: {
            cron: "* * * * *",
            singleton: true,
            timeoutMs: 60_000,
            handler: createSendRequestsJob({
              db: conn,
              repo,
              crm: ports.crm,
              logger: platform.logger,
              metrics: platform.metrics,
              notifyOps,
              appOrigin: env.APP_ORIGIN,
              opsLinkSecret: env.OPS_LINK_SECRET ?? "",
              offer: offerForCrm,
            }),
          },
        },
      ],
    };
  },
});

type OpsPublish = (
  tx: Executor,
  e: {
    type: string;
    version: number;
    aggregateType: string;
    aggregateId: string;
    memberId: string | null;
    payload: unknown;
  },
) => Promise<void>;

function opsRoutes(
  conn: Executor,
  repo: ReturnType<typeof createRequestsRepo>,
  publish: OpsPublish,
  platform: { rateLimit: Parameters<typeof rateLimit>[0] },
  secret: string,
) {
  const ops = new Hono<AppEnv>();
  // Per address, as it protects the tokens; answered as the rest of these pages are, in HTML — an operator opens them
  // in a browser, never the app. Null when the link may be opened.
  const limited = async (c: Context<AppEnv>): Promise<Response | null> => {
    let r;
    try {
      r = await platform.rateLimit.check("ops.link", `ip:${c.get("clientIp") ?? "unknown"}`);
    } catch {
      return c.html(page("This page is briefly unavailable — open the link again in a minute."), 503);
    }
    c.header("RateLimit-Limit", String(r.limit));
    c.header("RateLimit-Remaining", String(r.remaining));
    c.header("RateLimit-Reset", String(Math.ceil(r.resetMs / 1000)));
    if (r.allowed) return null;
    c.header("Retry-After", String(Math.max(1, Math.ceil((r.retryAfterMs ?? r.resetMs) / 1000))));
    return c.html(page("Too many links at once — wait a minute and open it again."), 429);
  };

  registerRoute("GET", "/ops/requests/:token", "public", "ops.link");
  ops.get("/requests/:token", async (c) => {
    const refused = await limited(c);
    if (refused) return refused;
    const v = verifyAction(secret, c.req.param("token"));
    if (!v.ok) {
      return c.html(
        page(v.reason === "expired" ? "This link has expired." : "This link is not valid."),
        v.reason === "expired" ? 410 : 403,
      );
    }
    const req = await repo.getById(conn, v.requestId);
    if (!req) return c.html(page("Request not found."), 404);
    const intent = effectiveIntent({
      intent: req.intent,
      fareId: req.fareId,
      offerId: req.offerId,
    });
    return c.html(
      confirmPage({
        token: c.req.param("token"),
        action: v.action,
        reference: req.reference,
        route: routeLabel(req.legs, req.tripType),
        name: req.contactName,
        typeLine:
          intent === "alternative" && req.replacesFareId
            ? `Type: Alternative to an expired fare (fare ${req.replacesFareId})`
            : null,
      }),
    );
  });

  registerRoute("POST", "/ops/requests/:token", "public", "ops.link");
  ops.post("/requests/:token", async (c) => {
    const refused = await limited(c);
    if (refused) return refused;
    const v = verifyAction(secret, c.req.param("token"));
    if (!v.ok) return c.html(page("This link is not valid or has expired."), 403);
    const r = await setStatus(conn, { requestId: v.requestId, status: v.action, agentId: "ops" }, { repo, publish });
    if (!r.ok) {
      // A week-old link pressed after the request moved on: the page says where it is, and nothing is written.
      if (r.code === "CONFLICT") return c.html(page(refusedLabel(r.from)));
      return c.html(page("Request not found."), 404);
    }
    return c.html(page(r.unchanged ? "Already marked — nothing changed." : `Marked as ${actionLabel(v.action)}.`));
  });

  return ops;
}

/** Why an operator link changed nothing: the request is already past the step it names. */
function refusedLabel(from: string): string {
  if (from === "closed") return "This request is closed — nothing changed.";
  if (from === "booked") return "Already booked — nothing changed.";
  return `Already ${from} — nothing changed.`;
}

function page(message: string): string {
  return `<!doctype html><html><body><p>${escapeHtml(message)}</p></body></html>`;
}

function confirmPage(input: {
  token: string;
  action: "quoted" | "booked" | "closed";
  reference: string;
  route: string;
  name: string;
  typeLine: string | null;
}): string {
  const type = input.typeLine ? `<p>${escapeHtml(input.typeLine)}</p>` : "";
  return `<!doctype html><html><body><p>${escapeHtml(input.reference)}</p><p>${escapeHtml(input.route)}</p><p>${escapeHtml(input.name)}</p>${type}<form method="post" action="/ops/requests/${escapeHtml(input.token)}"><button type="submit">Mark as ${escapeHtml(actionLabel(input.action))}</button></form></body></html>`;
}

function facade(db: Executor, repo: ReturnType<typeof createRequestsRepo>): RequestsFacade {
  return {
    listForMember: (exec, memberId) => repo.listForMember(exec ?? db, memberId),
    get: (exec, memberId, id) => repo.getForMember(exec ?? db, memberId, id),
  };
}
