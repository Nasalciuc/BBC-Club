import { z } from "zod";

export const MemberRegisteredV1 = z.object({
  type: z.literal("member.registered"),
  version: z.literal(1),
  memberId: z.string(),
  emailNormalized: z.string().email(),       // needed by members to match crm.mirror; tombstoned on delete
  registeredAt: z.string().datetime(),
});
export const MemberEmailVerifiedV1 = z.object({
  type: z.literal("member.email_verified"), version: z.literal(1),
  memberId: z.string(), verifiedAt: z.string().datetime(),
});
export const MemberPasswordChangedV1 = z.object({
  type: z.literal("member.password_changed"), version: z.literal(1),
  memberId: z.string(), changedAt: z.string().datetime(), reason: z.enum(["reset", "change"]),
});
export const MemberDeletedV1 = z.object({
  type: z.literal("member.deleted"), version: z.literal(1),
  memberId: z.string(), deletedAt: z.string().datetime(),
});
export type MemberRegisteredV1 = z.infer<typeof MemberRegisteredV1>;
export type MemberDeletedV1 = z.infer<typeof MemberDeletedV1>;
