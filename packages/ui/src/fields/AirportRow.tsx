import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "../icons";
import { baselineOffset, belowBaseline, rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  code: string;
  city: string;
  airport: string;
  /** `selected`: the chosen airport (a navy border and a check); `recent`: one searched before (a clock). */
  state?: "default" | "selected" | "recent";
  /**
   * `detail` (18, Search): the city over `Heathrow Airport · LHR`, a chevron. `code` (14, onboarding): the city alone,
   * the code in slate at the right.
   */
  layout?: "detail" | "code";
  onPress: () => void;
  testID: string;
};

/**
 * 18, measured: a white row 55 pt tall, radius 8, a hairline and a soft shadow; the 20-pt pin 11.2 pt in; the city's
 * baseline 23.4 pt down, 43 pt from the left, the airport's 17.1 pt under it; an 18-pt chevron 14 pt from the right.
 */
const DETAIL = { height: 55, radius: 8, pinLeft: 11.2, pin: 20, textLeft: 43, chevron: 18, chevronRight: 5 } as const;
const CITY_BASELINE = 23.4;
const LINE_PITCH = 17.1;
const DOT = { size: 2.6, gap: 8.8 } as const;

/** An airport to choose (14, 18): a white card with the map pin, the city, the airport and its code. */
export function AirportRow({ code, city, airport, state = "default", layout = "detail", onPress, testID }: Props) {
  const selected = state === "selected";
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${city}, ${airport}, ${code}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        layout === "code" && styles.codeRow,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}
    >
      <Icon
        name={state === "recent" ? "clock" : "map-pin"}
        size={DETAIL.pin}
        color={tokens.colors.textPrimary}
        strokeWidth={1.8}
      />
      <View style={[styles.text, layout === "detail" && styles.detailText]}>
        <Text style={layout === "detail" ? styles.city : styles.codeCity} numberOfLines={1}>
          {city}
        </Text>
        {layout === "detail" ? (
          <View style={styles.airportRow}>
            <Text style={styles.airport} numberOfLines={1}>
              {airport}
            </Text>
            <View style={styles.dot} />
            <Text style={styles.airport}>{code}</Text>
          </View>
        ) : null}
      </View>
      {layout === "code" ? <Text style={styles.code}>{code}</Text> : null}
      {selected ? (
        <Icon name="check" size={20} color={tokens.colors.textPrimary} strokeWidth={2.25} />
      ) : layout === "detail" ? (
        <Icon name="chevron" size={DETAIL.chevron} color={tokens.colors.textSecondary} strokeWidth={1.75} />
      ) : null}
    </Pressable>
  );
}

const city = tokens.type.rowTitleLg;
const meta = tokens.type.rowMeta;

const styles = StyleSheet.create({
  row: {
    minHeight: DETAIL.height,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: DETAIL.pinLeft,
    paddingRight: DETAIL.chevronRight,
    borderRadius: DETAIL.radius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.borderFaint,
    backgroundColor: tokens.colors.surfaceCard,
    ...tokens.elevation.card,
  },
  codeRow: { minHeight: 56, paddingHorizontal: tokens.space.gutter, gap: tokens.space.gutter },
  selected: { borderWidth: 1.5, borderColor: tokens.colors.primary },
  pressed: { opacity: 0.8 },
  text: { flex: 1, marginLeft: DETAIL.textLeft - DETAIL.pinLeft - DETAIL.pin },
  detailText: { alignSelf: "flex-start", paddingTop: CITY_BASELINE - baselineOffset(city) },
  city: { ...rn(city), color: tokens.colors.textPrimary },
  codeCity: { ...rn(tokens.type.bodyStrong), color: tokens.colors.textPrimary },
  airportRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: DOT.gap,
    marginTop: LINE_PITCH - belowBaseline(city) - baselineOffset(meta),
  },
  airport: { ...rn(meta), color: tokens.colors.textSecondary, flexShrink: 1 },
  dot: { width: DOT.size, height: DOT.size, borderRadius: DOT.size, backgroundColor: tokens.colors.textSecondary },
  code: { ...rn(tokens.type.bodyStrong), color: tokens.colors.textSecondary },
});
