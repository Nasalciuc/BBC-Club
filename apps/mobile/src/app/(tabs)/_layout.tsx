import { Tabs, usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabBar } from "@bbc/ui";

import { TAB_ROUTES, type TabKey } from "@/features/navigation/tab-routes";
import { useUnreadQuotes } from "@/features/requests/useUnreadQuotes";

function activeFromPath(pathname: string): TabKey {
  if (pathname.includes("requests")) return "requests";
  if (pathname.includes("profile")) return "profile";
  return "explore";
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const active = activeFromPath(pathname);
  // The same dot as on a screen pushed over the tabs (RootTabBar): requests whose quote is ready.
  const unread = useUnreadQuotes();

  // Figma TabBar (41:39) draws the home indicator inside the bar: the bar takes the bottom inset itself, so its white
  // runs to the screen's edge — padding the screen instead left the Stack's black showing under it.
  return (
    <Tabs
      tabBar={() => (
        <TabBar
          testID="tabs.bar"
          active={active}
          unread={unread}
          bottomInset={insets.bottom}
          onPress={(key) => router.push(TAB_ROUTES[key])}
        />
      )}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="explore" options={{ title: "Explore" }} />
      <Tabs.Screen name="requests" options={{ title: "Requests" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
