import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type TabKey = "explore" | "requests" | "profile";
const TABS: { key: TabKey; label: string }[] = [
  { key: "explore", label: "Explore" },
  { key: "requests", label: "Requests" },
  { key: "profile", label: "Profile" },
];

const DEFAULT_TEST_IDS: Record<TabKey, string> = {
  explore: "tab.explore",
  requests: "tab.requests",
  profile: "tab.profile",
};

/** The home indicator's room under the targets; a phone with a taller inset gets its own. */
const HOME_INDICATOR = 24;

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
 * The tab bar (sheet 42): Explore (compass), Requests (clipboard), Profile (person). The active tab is a filled navy icon
 * and a bold label; the others slate line icons. A 6-pt navy dot on Requests while a quote is ready.
 */
export function TabBar({ active, unread, onPress, bottomInset = 0, testID, testIDs }: Props) {
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(bottomInset, HOME_INDICATOR) }]} testID={testID}>
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
            <View>
              <TabIcon tab={tab.key} active={on} />
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

/** The three tab icons, line and filled (sheet 42). 28 pt. */
function TabIcon({ tab, active }: { tab: TabKey; active: boolean }) {
  const navy = tokens.colors.primary;
  const slate = tokens.colors.textSecondary;
  const white = tokens.colors.textOnPhoto;
  if (tab === "explore") {
    return active ? (
      <Svg width={28} height={28} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={10.5} fill={navy} />
        <Path d="M15.9 8.1 13.4 13.4 8.1 15.9l2.5-5.3 5.3-2.5Z" fill={white} />
      </Svg>
    ) : (
      <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={9.75} stroke={slate} strokeWidth={1.5} />
        <Path
          d="M15.9 8.1 13.4 13.4 8.1 15.9l2.5-5.3 5.3-2.5Z"
          stroke={slate}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      </Svg>
    );
  }
  if (tab === "requests") {
    return active ? (
      <Svg width={28} height={28} viewBox="0 0 24 24">
        <Rect x={4.5} y={3.6} width={15} height={18.4} rx={2.6} fill={navy} />
        <Rect x={8.6} y={2} width={6.8} height={3.8} rx={1.2} fill={navy} stroke={white} strokeWidth={1} />
        <Path d="M8.5 11h7M8.5 14.5h7M8.5 18h4.5" stroke={white} strokeWidth={1.7} strokeLinecap="round" />
      </Svg>
    ) : (
      <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
        <Rect x={4.75} y={4} width={14.5} height={17.5} rx={2.4} stroke={slate} strokeWidth={1.5} />
        <Rect
          x={8.75}
          y={2.5}
          width={6.5}
          height={3.5}
          rx={1.1}
          stroke={slate}
          strokeWidth={1.5}
          fill={tokens.colors.surfaceCard}
        />
        <Path d="M8.5 11h7M8.5 14.5h7M8.5 18h4.5" stroke={slate} strokeWidth={1.5} strokeLinecap="round" />
      </Svg>
    );
  }
  return active ? (
    <Svg width={28} height={28} viewBox="0 0 24 24">
      <Circle cx={12} cy={7.6} r={4.4} fill={navy} />
      <Path d="M3.6 21.2c0-4.3 3.8-7.4 8.4-7.4s8.4 3.1 8.4 7.4c0 .5-.4.8-.9.8H4.5c-.5 0-.9-.3-.9-.8Z" fill={navy} />
    </Svg>
  ) : (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={7.8} r={4.2} stroke={slate} strokeWidth={1.5} />
      <Path d="M4.2 21.2c0-4.1 3.5-7.1 7.8-7.1s7.8 3 7.8 7.1" stroke={slate} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    paddingTop: tokens.space.xs,
    backgroundColor: tokens.colors.surfaceCard,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.colors.borderDefault,
  },
  tab: { flex: 1, minHeight: 52, alignItems: "center", justifyContent: "center", gap: 2 },
  label: { ...rn(tokens.type.tab), color: tokens.colors.textSecondary },
  labelOn: { ...rn(tokens.type.tabActive), color: tokens.colors.primary },
  dot: {
    position: "absolute",
    top: 0,
    right: -6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.colors.primary,
  },
});
