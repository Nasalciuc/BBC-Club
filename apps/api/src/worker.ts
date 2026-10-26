import { buildApp } from "./index";
import { DatabaseUnreachable } from "./registry";

// As the api: a database still unreachable after boot's retries is logged by buildApp; exit non-zero so the restart
// policy starts the worker again, rather than let Bun print the error and its cause (AGENTS.md rule 6).
const { app, shutdown, env, platform } = await buildApp({ role: "worker" }).catch((e: unknown) => {
  if (e instanceof DatabaseUnreachable) process.exit(1);
  throw e;
});
const server = Bun.serve({ port: env.WORKER_PORT, fetch: app.fetch, idleTimeout: 120 });
platform.logger.info({ port: server.port }, "worker up");
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, async () => {
    server.stop(false);
    await shutdown();
    process.exit(0);
  });
}
