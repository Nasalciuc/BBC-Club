import { z } from "zod";
const base = (type: string, version = 1) => ({ type: z.literal(type), version: z.literal(version) });

export const MemberRegisteredV1 = z.object({ ...base("member.registered"), memberId: z.string(), emailNormalized: z.string().email(), registeredAt: z.string().datetime() });
export const MemberEmailVerifiedV1 = z.object({ ...base("member.email_verified"), memberId: z.string(), verifiedAt: z.string().datetime() });
export const MemberPasswordChangedV1 = z.object({ ...base("member.password_changed"), memberId: z.string(), changedAt: z.string().datetime(), reason: z.enum(["reset", "change"]) });
export const MemberProfileUpdatedV1 = z.object({ ...base("member.profile_updated"), memberId: z.string(), fields: z.array(z.string()), updatedAt: z.string().datetime() });
export const MemberLinkedToCrmV1 = z.object({ ...base("member.linked_to_crm"), memberId: z.string(), crmClientId: z.string(), linkedAt: z.string().datetime() });
export const MemberDeletedV1 = z.object({ ...base("member.deleted"), memberId: z.string(), deletedAt: z.string().datetime() });
