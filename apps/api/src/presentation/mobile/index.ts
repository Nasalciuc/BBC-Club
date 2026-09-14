import { Hono } from "hono";
import type { ModuleDescriptor } from "@bbc/shared/module-contract";

/** stage 2 fills this with routes/, view-models/ and compose/feed. /v1/app-config stays in the host. */
export const mobileBff = (): ModuleDescriptor<Record<string, never>, Record<string, never>> => ({
  name: "mobile-bff",
  layer: "presentation",
  init: () => ({ exposes: {}, routes: [{ basePath: "/v1", app: new Hono() }], consumers: [], jobs: [] }),
});
