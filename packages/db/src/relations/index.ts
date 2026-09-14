import { defineRelations } from "drizzle-orm";
import * as schema from "../schema";
import { proposalsRelations } from "./proposals";
import { notificationsRelations } from "./notifications";
import { personalizationRelations } from "./personalization";

/** Relational Queries v2. Each part is defined by its owning module and may reference ONLY that
 *  module's tables — a relation across schemas is a cross-module JOIN by another name (checked by
 *  test/relations.test.ts). Members, engagement and crm have no nested reads in v1 → no parts. */
export const relations = defineRelations(schema, (r) => ({
  ...proposalsRelations(r),
  ...notificationsRelations(r),
  ...personalizationRelations(r),
}));
