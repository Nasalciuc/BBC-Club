// @ts-nocheck � drizzle-orm@1.0.0-rc.4 RQ typings; see packages/db/README.md
import type { RelationsBuilder } from "drizzle-orm";
import type * as schema from "../schema";

/** notifications.notifications and device_tokens share member_id (opaque) — no relation across
 *  to members.profile on purpose. Only intra-schema navigation is declared. */
export const notificationsRelations = (r: RelationsBuilder<typeof schema>) => ({
  deviceTokens: {}, // placeholder: nothing nested in v1; kept so the module owns its part
  notificationsTable: {},
});
