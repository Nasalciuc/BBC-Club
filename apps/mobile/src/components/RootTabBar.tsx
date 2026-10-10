import { useRouter } from "expo-router";
import { TabBar } from "@bbc/ui";

import { TAB_ROUTES, type TabKey } from "@/features/navigation/tab-routes";
import { useUnreadQuotes } from "@/features/requests/useUnreadQuotes";

/**
 * The tab bar of a screen pushed over the tabs (a fare, a request, a confirmation). A tab goes back down to the tabs
 * already open beneath (`dismissTo`, a POP_TO) instead of pushing another set of tabs on top each time, and the Requests
 * dot is the real one — not a 0.
 */
export function RootTabBar({ active }: { active: TabKey }) {
  const router = useRouter();
  const unread = useUnreadQuotes();
  return (
    <TabBar testID="tabs.bar" active={active} unread={unread} onPress={(key) => router.dismissTo(TAB_ROUTES[key])} />
  );
}
