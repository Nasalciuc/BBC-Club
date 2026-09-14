import { z } from "zod";
const base = (type: string, version = 1) => ({ type: z.literal(type), version: z.literal(version) });

export const CrmMirrorSyncedV1 = z.object({
  ...base("crm.mirror.synced"),
  runId: z.string().uuid(),
  rowsUpserted: z.number().int().nonnegative(),
  newEmails: z.array(z.string().email()).max(1000),
  syncedAt: z.string().datetime(),
});
export const CrmActivityCreatedV1 = z.object({
  ...base("crm.activity_created"),
  memberId: z.string(),
  offerId: z.string().uuid(),
  crmActivityId: z.string().nullable(),
  at: z.string().datetime(),
});
