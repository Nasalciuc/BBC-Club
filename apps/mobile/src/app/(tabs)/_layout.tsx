import { Tabs, usePathname, useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabBar } from "@bbc/ui";

import { fetchRequests } from "@/lib/api";

type TabKey = "explore" | "requests" | "profile";

function activeFromPath(pathname: string): TabKey {
  if (pathname.includes("requests")) return "requests";
  if (pathname.includes("profile")) return "profile";
  return "explore";
}

const ROUTES: Record<TabKey, Href> = {
  explore: "/(tabs)/explore" as Href,
  requests: "/(tabs)/requests" as Href,
  profile: "/(tabs)/profile" as Href,
};

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const active = activeFromPath(pathname);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    void (async () => {
      const result = await fetchRequests();
      if (!result.ok) return;
      setUnread(result.data.items.filter((r) => r.status === "quoted").length);
    })();
  }, [pathname]);

  return (
    <View style={{ flex: 1, paddingBottom: insets.bottom }}>
      <Tabs
        tabBar={() => (
          <TabBar testID="tabs.bar" active={active} unread={unread} onPress={(key) => router.push(ROUTES[key])} />
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
