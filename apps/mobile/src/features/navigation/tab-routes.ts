import type { Href } from "expo-router";

export type TabKey = "explore" | "requests" | "profile";

/** The three tabs (DESIGN.md: EXPLORE / REQUESTS / PROFILE). */
export const TAB_ROUTES: Record<TabKey, Href> = {
  explore: "/(tabs)/explore" as Href,
  requests: "/(tabs)/requests" as Href,
  profile: "/(tabs)/profile" as Href,
};
