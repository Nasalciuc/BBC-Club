import { authHeaders } from "@/features/auth/client";
import type { Profile } from "@/lib/api";
import { env } from "@/lib/env";

import { portraitSource, type PortraitSource } from "./photo-logic";

/**
 * The member's portrait wherever it is shown (Explore's greeting, Profile, the Photo sheet): the photo they added,
 * asked of the club with this session's own headers — the route answers only its member, and nothing else can read it
 * (ADR-IMPL-070) — else the photo the club keeps an address of, else none and the initials.
 */
export function portraitOf(profile: Profile | null | undefined): PortraitSource | null {
  return portraitSource(profile, env.EXPO_PUBLIC_API_URL, authHeaders());
}
