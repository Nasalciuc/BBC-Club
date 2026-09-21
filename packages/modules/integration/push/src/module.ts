import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import { recordingSender, type PushFacade } from "./api";

/** stage 3 replaces recordingSender with APNs + FCM chosen by env. */
export const pushModule = (override?: PushFacade): ModuleDescriptor<Record<string, never>, PushFacade> => ({
  name: "push",
  layer: "integration",
  init: () => ({ exposes: override ?? recordingSender() }),
});
