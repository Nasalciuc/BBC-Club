import { z } from "zod";

const base = (type: string, version = 1) => ({ type: z.literal(type), version: z.literal(version) });

export const RequestSubmittedV1 = z.object({
  ...base("request.submitted"),
  requestId: z.string().uuid(),
  memberId: z.string().nullable(),
  reference: z.string(),
  route: z.string(),
  cabin: z.enum(["business", "first"]),
  fareId: z.string().uuid().nullable(),
  offerId: z.string().uuid().nullable(),
  submittedAt: z.string().datetime(),
});

export const RequestStatusChangedV1 = z.object({
  ...base("request.status_changed"),
  requestId: z.string().uuid(),
  memberId: z.string().nullable(),
  from: z.string(),
  to: z.string(),
  /** Present on new publishes; optional so historical journal rows still parse. */
  route: z.string().optional(),
  changedAt: z.string().datetime(),
});

export const CampaignRunStartedV1 = z.object({
  ...base("campaign.run_started"),
  runId: z.string().uuid(),
  segmentId: z.string().uuid(),
  offerId: z.string().uuid(),
  targeted: z.number().int(),
  startedAt: z.string().datetime(),
});
