# @bbc/platform — how to use it

```ts
// apps/api/src/index.ts (boot)
const platform = createPlatform(db, { level: env.LOG_LEVEL });
for (const [type, def] of Object.entries(EVENT_CATALOGUE)) platform.events.defineEvent(type, def);
registerPlatformJobs(platform.jobs);
registerModules(platform);           // each module: registerConsumer(...) and jobs.register(...)
platform.poller.start();             // one line; SKIP LOCKED makes several instances safe
```

```ts
// inside a use case — publishing is only possible with a transaction in hand
await withTx(db, async (tx) => {
  const offer = await offersRepo.insert(tx, input);
  await platform.events.publish(tx, {
    type: "offer.published", aggregateType: "offer", aggregateId: offer.id,
    payload: { type: "offer.published", version: 1, offerId: offer.id, /* … */ },
    publishedBy: "proposals",
  });
});
```

```ts
// inside a module — consuming
platform.events.registerConsumer("offer.published", "notifications.onOfferPublished", async (ctx, payload) => {
  // ctx.tx also marks the delivery done: your writes and "processed" commit together
  // ctx.principal is system + actorMemberId from the event — repositories stay scoped
  await enqueueFor(ctx.tx, payload.offerId);
});
```

**Operating it:** `GET /metrics` (queue depth, oldest pending age, DLQ, job durations) · pause a consumer with
`flags.set("consumer.<name>.paused", { enabled: true })` · replay a dead delivery with `poller.replay(id)` ·
`jobs.lastRuns()` answers "did it run?" · alerts: oldest pending > 5 min, any DLQ row, job stale > 36 h.
