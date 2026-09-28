import { buildApp } from "./index";

const { app, shutdown, env, platform } = await buildApp({ role: "worker" });
const server = Bun.serve({ port: env.WORKER_PORT, fetch: app.fetch, idleTimeout: 120 });
platform.logger.info({ port: server.port }, "worker up");
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, async () => {
    server.stop(false);
    await shutdown();
    process.exit(0);
  });
}
