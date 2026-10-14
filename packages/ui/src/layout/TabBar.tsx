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

const DEFAULT_TEST_IDS: Record<TabKey, string> = {
  explore: "tab.explore",
  requests: "tab.requests",
  profile: "tab.profile",
};

/** Figma TabBar (41:39) draws the home indicator's 32 pt under the targets; a phone with a taller inset gets its own. */
const HOME_INDICATOR = 32;

type Props = {
  active: TabKey;
  unread: number;
  onPress: (key: TabKey) => void;
  /** The screen's bottom safe-area inset: the bar's white runs under the home indicator / navigation bar to the edge. */
  bottomInset?: number;
  testID?: string;
  /** Override per-tab testIDs. Defaults are `tab.explore` / `tab.requests` / `tab.profile`. */
  testIDs?: Partial<Record<TabKey, string>>;
};

/**
 * Figma TabBar (41:39): white, no rule above — 4 pt, the three 48-pt targets sharing the width, then the bottom inset.
 * Labels in `tab-mono` (DESIGN.md keeps 11 pt). The dot lights only for quote_ready count — the caller passes that, not
 * unread inbox.
 */
export function TabBar({ active, unread, onPress, bottomInset = 0, testID, testIDs }: Props) {
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(bottomInset, HOME_INDICATOR) }]} testID={testID}>
      {TABS.map((tab) => {
        const on = tab.key === active;
        const color = on ? tokens.colors.textPrimary : tokens.colors.textSecondary;
        const id = testIDs?.[tab.key] ?? DEFAULT_TEST_IDS[tab.key];
        return (
          <Pressable
            key={tab.key}
            testID={id}
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
            <Text style={[styles.label, { color }]} maxFontSizeMultiplier={1.15}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    paddingTop: tokens.space.xxs,
    backgroundColor: tokens.colors.surfaceCard,
  },
  tab: { flex: 1, height: 48, alignItems: "center", justifyContent: "center", gap: tokens.space.xxs },
  label: { ...rn(tokens.type.tabMono) },
  dot: {
    position: "absolute",
    top: -2,
    right: -4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.colors.accentWarm,
  },
});
