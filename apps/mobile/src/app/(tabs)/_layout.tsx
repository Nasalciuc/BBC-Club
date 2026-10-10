import { Tabs, usePathname, useRouter } from "expo-router";
import { View } from "react-native";
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

  return (
    <View style={{ flex: 1, paddingBottom: insets.bottom }}>
      <Tabs
        tabBar={() => (
          <TabBar testID="tabs.bar" active={active} unread={unread} onPress={(key) => router.push(TAB_ROUTES[key])} />
        )}
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen name="explore" options={{ title: "Explore" }} />
        <Tabs.Screen name="requests" options={{ title: "Requests" }} />
        <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      </Tabs>
    </View>
  );
}
