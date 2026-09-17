import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type TabKey = "explore" | "requests" | "profile";
const TABS: { key: TabKey; label: string; icon: IconName }[] = [
  { key: "explore", label: "EXPLORE", icon: "explore" },
  { key: "requests", label: "REQUESTS", icon: "inbox" },
  { key: "profile", label: "PROFILE", icon: "profile" },
];

type Props = { active: TabKey; unread: number; onPress: (key: TabKey) => void; testID?: string };

/** Dot lights only for quote_ready count — caller passes that, not unread inbox. */
export function TabBar({ active, unread, onPress, testID }: Props) {
  return (
    <View style={styles.bar} testID={testID}>
      {TABS.map((tab) => {
        const on = tab.key === active;
        const color = on ? tokens.colors.textPrimary : tokens.colors.textTertiary;
        return (
          <Pressable
            key={tab.key}
            testID={`tab.${tab.key}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tab.key === "requests" && unread > 0 ? `${tab.label}, ${unread} ready` : tab.label}
            onPress={() => onPress(tab.key)}
            style={styles.tab}
          >
            <View>
              <Icon name={tab.icon} size={24} color={color} />
              {tab.key === "requests" && unread > 0 ? <View style={styles.dot} /> : null}
            </View>
            <Text style={[styles.label, { color }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 84,
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: tokens.space.sm,
    backgroundColor: tokens.colors.surfacePage,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.borderDefault,
  },
  tab: { width: 88, alignItems: "center", gap: tokens.space.xxs + 2 },
  label: { ...rn(tokens.type.tabMono) },
  dot: {
    position: "absolute",
    top: -2,
    right: -4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.colors.primary,
  },
});
