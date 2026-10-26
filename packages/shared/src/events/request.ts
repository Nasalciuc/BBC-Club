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
  /** Present on new publishes; optional so historical journal rows still parse. */
  intent: z.enum(["quote", "alternative"]).nullable().optional(),
  replacesFareId: z.string().uuid().nullable().optional(),
  /** The indicative price the search showed for a quote's route, recomputed by the server (ADR-IMPL-042). Optional so
   *  historical journal rows still parse; null on every other request. Whole US dollars. */
  shownEstimate: z
    .object({
      amount: z.number().int().positive(),
      currency: z.literal("USD"),
      /** The fingerprint of the rules that computed it (16 hex; identifies the rules, never reveals them — ADR-IMPL-037),
       *  so a number can be traced to the rules loaded at that moment. Optional, additive. */
      rules: z
        .string()
        .regex(/^[0-9a-f]{16}$/)
        .optional(),
    })
    .nullable()
    .optional(),
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
