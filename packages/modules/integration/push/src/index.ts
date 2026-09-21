// stage 3: APNs HTTP/2 (apns2) and FCM v1 (firebase-admin) adapters implementing this port (see MODULE.md).
import type { PushFacade, PushResult } from "./api";
export type { PushFacade, PushFacade as PushSender, PushResult };
export { recordingSender } from "./api";
