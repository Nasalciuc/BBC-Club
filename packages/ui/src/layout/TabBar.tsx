import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArtGlyph, Icon, TAB_ACTIVE } from "../icons";
import { baselineOffset, rn } from "../rn-type";
import { tokens } from "../tokens";

type TabKey = "explore" | "requests" | "profile";
const TABS: { key: TabKey; label: string; line: "compass" | "clipboard" | "user" }[] = [
  { key: "explore", label: "Explore", line: "compass" },
  { key: "requests", label: "Requests", line: "clipboard" },
  { key: "profile", label: "Profile", line: "user" },
];

const DEFAULT_TEST_IDS: Record<TabKey, string> = {
  explore: "tab.explore",
  requests: "tab.requests",
  profile: "tab.profile",
};

type Props = {
  active: TabKey;
  unread: number;
  onPress: (key: TabKey) => void;
  /** The screen's bottom safe-area inset: the bar's white runs under the home indicator to the edge. */
  bottomInset?: number;
  testID?: string;
  /** Override per-tab testIDs. Defaults are `tab.explore` / `tab.requests` / `tab.profile`. */
  testIDs?: Partial<Record<TabKey, string>>;
};

/**
 * 09, measured: the bar 45.4 pt above the home indicator's 34, white under a hairline; three equal columns; the icons
 * 24 pt, centred 20.5 pt under the hairline; the words' baseline 45.2 pt under it. Active: the traced filled glyph
 * (05, 11, 12) and Semibold navy words; the others slate line icons and Regular words. A 6.5-pt navy dot at the
 * clipboard's top-right while a quote is ready (28).
 */
const BAR = { height: 45.4, iconCentre: 20.5, labelBaseline: 45.2, icon: 24 } as const;
const DOT = { size: 6.5, right: -6, top: 1.2 } as const;
/** The traced active glyphs' heights as the images draw them (22.4 pt on 11 for the clipboard). */
const ACTIVE_HEIGHT: Record<TabKey, number> = { explore: 23.5, requests: 21.7, profile: 21.7 };

export function TabBar({ active, unread, onPress, bottomInset = 0, testID, testIDs }: Props) {
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(bottomInset, 6) }]} testID={testID}>
      {TABS.map((tab) => {
        const on = tab.key === active;
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
            <View style={styles.icon}>
              {on ? (
                <ArtGlyph art={TAB_ACTIVE[tab.key]} height={ACTIVE_HEIGHT[tab.key]} color={tokens.colors.primary} />
              ) : (
                <Icon name={tab.line} size={BAR.icon} color={tokens.colors.textSecondary} strokeWidth={1.4} />
              )}
              {tab.key === "requests" && unread > 0 ? <View style={styles.dot} /> : null}
            </View>
            <Text style={on ? styles.labelOn : styles.label} maxFontSizeMultiplier={1.15}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const label = tokens.type.tab;

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: tokens.colors.surfaceCard,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.colors.borderFaint,
  },
  tab: { flex: 1, height: BAR.height, alignItems: "center" },
  icon: {
    position: "absolute",
    top: BAR.iconCentre - BAR.icon / 2,
    height: BAR.icon,
    minWidth: BAR.icon,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...rn(label),
    color: tokens.colors.textSecondary,
    position: "absolute",
    top: BAR.labelBaseline - baselineOffset(label),
  },
  labelOn: {
    ...rn(tokens.type.tabActive),
    color: tokens.colors.primary,
    position: "absolute",
    top: BAR.labelBaseline - baselineOffset(tokens.type.tabActive),
  },
  dot: {
    position: "absolute",
    top: DOT.top,
    right: DOT.right,
    width: DOT.size,
    height: DOT.size,
    borderRadius: DOT.size,
    backgroundColor: tokens.colors.primary,
  },
});
