import { z } from "zod";
const base = (type: string, version = 1) => ({ type: z.literal(type), version: z.literal(version) });

export const NotificationDeliveredV1 = z.object({
  ...base("notification.delivered"),
  notificationId: z.string().uuid(),
  memberId: z.string(),
  platform: z.enum(["ios", "android"]),
  at: z.string().datetime(),
});
export const NotificationFailedV1 = z.object({
  ...base("notification.failed"),
  notificationId: z.string().uuid(),
  memberId: z.string(),
  platform: z.enum(["ios", "android"]),
  reason: z.string(),
  at: z.string().datetime(),
});
