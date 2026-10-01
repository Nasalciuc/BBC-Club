import { z } from "zod";

export const SearchEvent = z
  .object({
    from: z.string().length(3),
    to: z.string().length(3),
    cabin: z.enum(["business", "first"]),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    hadFares: z.boolean(),
    results: z.number().int().nonnegative(),
    at: z.string().datetime().optional(),
  })
  .strict();

export type SearchEvent = z.infer<typeof SearchEvent>;

const IDENTITY = ["memberId", "member_id", "ip", "deviceId", "device_id"] as const;

export function assertNoIdentity(value: object): void {
  for (const key of IDENTITY) {
    if (key in value) throw new Error(`search event must not carry ${key}`);
  }
}
