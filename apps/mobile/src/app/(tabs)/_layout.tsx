import { Tabs } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ClubIcon } from "@/components/club-icon";
import { Club } from "@/constants/club";

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return <Text style={[styles.label, focused && styles.labelActive]}>{label}</Text>;
}

function TabIcon({ name, focused }: { name: "proposals" | "inbox" | "profile"; focused: boolean }) {
  return (
    <View style={styles.iconWrap}>
      <ClubIcon name={name} size={18} color={focused ? Club.colors.primary : Club.colors.textSecondary} />
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Club.colors.surfaceCard,
          borderTopColor: Club.colors.borderDefault,
          borderTopWidth: 1,
          height: 84 + Math.max(insets.bottom - 8, 0),
          paddingTop: Club.space.xs,
          paddingBottom: Math.max(insets.bottom, Club.space.sm),
        },
        tabBarActiveTintColor: Club.colors.primary,
        tabBarInactiveTintColor: Club.colors.textSecondary,
        tabBarShowLabel: true,
      }}
    >
      <Tabs.Screen
        name="proposals"
        options={{
          title: "Proposals",
          tabBarAccessibilityLabel: "Proposals",
          tabBarButton: (props) => (
            <Pressable
              testID="tabs.proposals"
              accessibilityRole="button"
              accessibilityState={props.accessibilityState}
              accessibilityLabel={props.accessibilityLabel}
              onPress={props.onPress}
              onLongPress={props.onLongPress}
              style={props.style}
            >
              {props.children}
            </Pressable>
          ),
          tabBarLabel: ({ focused }) => <TabLabel label="PROPOSALS" focused={focused} />,
          tabBarIcon: ({ focused }) => <TabIcon name="proposals" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Inbox",
          tabBarAccessibilityLabel: "Inbox",
          tabBarButton: (props) => (
            <Pressable
              testID="tabs.inbox"
              accessibilityRole="button"
              accessibilityState={props.accessibilityState}
              accessibilityLabel={props.accessibilityLabel}
              onPress={props.onPress}
              onLongPress={props.onLongPress}
              style={props.style}
            >
              {props.children}
            </Pressable>
          ),
          tabBarLabel: ({ focused }) => <TabLabel label="INBOX" focused={focused} />,
          tabBarIcon: ({ focused }) => <TabIcon name="inbox" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarAccessibilityLabel: "Profile",
          tabBarButton: (props) => (
            <Pressable
              testID="tabs.profile"
              accessibilityRole="button"
              accessibilityState={props.accessibilityState}
              accessibilityLabel={props.accessibilityLabel}
              onPress={props.onPress}
              onLongPress={props.onLongPress}
              style={props.style}
            >
              {props.children}
            </Pressable>
          ),
          tabBarLabel: ({ focused }) => <TabLabel label="PROFILE" focused={focused} />,
          tabBarIcon: ({ focused }) => <TabIcon name="profile" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  label: {
    ...Club.type.tabMono,
    color: Club.colors.textSecondary,
    textTransform: "uppercase",
    marginTop: 2,
  },
  labelActive: {
    color: Club.colors.primary,
  },
  iconWrap: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
