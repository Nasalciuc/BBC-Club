import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabBar } from "@bbc/ui";

import { TAB_ROUTES, type TabKey } from "@/features/navigation/tab-routes";
import { useUnreadQuotes } from "@/features/requests/useUnreadQuotes";

/**
 * The tab bar of a screen pushed over the tabs (a fare, a request, a confirmation). A tab goes back down to the tabs
 * already open beneath (`dismissTo`, a POP_TO) instead of pushing another set of tabs on top each time, and the Requests
 * dot is the real one — not a 0. It takes the bottom inset, as on the tabs: the screen places it at its bottom edge.
 */
export function RootTabBar({ active }: { active: TabKey }) {
  const router = useRouter();
  const unread = useUnreadQuotes();
  const insets = useSafeAreaInsets();
  return (
    <TabBar
      testID="tabs.bar"
      active={active}
      unread={unread}
      bottomInset={insets.bottom}
      onPress={(key) => router.dismissTo(TAB_ROUTES[key])}
    />
  );
}
