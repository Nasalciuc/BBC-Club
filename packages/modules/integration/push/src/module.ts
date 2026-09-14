import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import { recordingSender, type PushSender } from "./index";

/** stage 3 replaces recordingSender with APNs + FCM chosen by env. */
export const pushModule = (override?: PushSender): ModuleDescriptor<Record<string, never>, PushSender> => ({
  name: "push",
  layer: "integration",
  init: () => ({ exposes: override ?? recordingSender() }),
});
