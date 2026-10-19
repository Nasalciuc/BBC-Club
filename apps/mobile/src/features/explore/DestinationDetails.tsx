import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { FareVM } from "@bbc/shared/api/v1/fares";
import { Chip, Divider, FlightCard, Skeleton, rn, tokens } from "@bbc/ui";

import type { SearchState } from "@/features/search/useSearch";
import { countryName } from "@/lib/countries";
import { formatPrice } from "@/lib/format";

import { localTime, msToNextMinute } from "./local-time";
import { cabinLabel, datesChipLabel, flightOptionsTitle, noFareCopy, travelersLabel } from "./travel-preferences";

type Props = {
  state: SearchState;
  /** The phone is offline: the summary says so (19) — the fares already on screen stay under it. */
  offline: boolean;
  onRetry: () => void;
  onEditDates: () => void;
  onEditCabin: () => void;
  onEditTravelers: () => void;
  onOpenFare: (fare: FareVM) => void;
  /** 13 sets the summary between rules on the sheet; 04 frames it in a card under the photograph. */
  framed?: boolean;
  /** `explore` in Explore's sheet (13), `destination` on the destination's page (04). */
  testIDPrefix: "explore" | "destination";
};

const PAUSED = "Searching paused for a moment. Try again shortly.";

/**
 * A destination (13, 04, 19): the city and its country, the trip's three chips, the fare's summary beside the city's
 * local time, then the flight options — one fare as a card of its own (`Flight option`, 13), several as rows (`Flight
 * options`, 04). `Request a quote` is the screen's pill, docked below by the screen.
 */
export function DestinationDetails({
  state,
  offline,
  onRetry,
  onEditDates,
  onEditCabin,
  onEditTravelers,
  onOpenFare,
  framed = false,
  testIDPrefix,
}: Props) {
  const to = state.route?.to ?? state.to;
  const city = to?.city ?? "";
  const country = countryName(to?.countryCode);
  const fares = (state.status === "done" || state.status === "paused") && state.results ? state.results : [];
  const clock = useLocalTime(city, state.route?.to.tz);

  return (
    <View style={styles.root}>
      <View style={styles.title}>
        <Text style={styles.city} accessibilityRole="header" numberOfLines={2}>
          {city}
        </Text>
        {country ? <Text style={styles.country}>{country}</Text> : null}
      </View>

      {/* One row that scrolls sideways to the screen's edges: wrapped, dated chips would push the first flight under
          the docked `Request a quote` (13). */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chips}
        testID={`${testIDPrefix}.chips`}
      >
        <Chip
          testID={`${testIDPrefix}.chip.dates`}
          icon="calendar"
          label={datesChipLabel(state.dates)}
          fill="content"
          onPress={onEditDates}
        />
        <Chip
          testID={`${testIDPrefix}.chip.cabin`}
          icon="seat"
          label={cabinLabel(state.cabin)}
          fill="content"
          onPress={onEditCabin}
        />
        <Chip
          testID={`${testIDPrefix}.chip.travelers`}
          icon="user"
          label={travelersLabel(state.passengers)}
          fill="content"
          onPress={onEditTravelers}
        />
      </ScrollView>

      {framed ? null : <Divider />}
      <View style={[styles.summary, framed && styles.summaryCard]} testID={`${testIDPrefix}.summary`}>
        <View style={styles.summaryMain}>
          <Summary state={state} offline={offline} onRetry={onRetry} testIDPrefix={testIDPrefix} compact={framed} />
        </View>
        {clock ? (
          <>
            <Divider vertical />
            {/* 04 sets the clock small in its card; 13 as large as the fare. */}
            <View style={styles.clock} testID={`${testIDPrefix}.localTime`}>
              <Text style={styles.label}>LOCAL TIME</Text>
              <Text style={framed ? styles.clockTimeSm : styles.clockTime}>{clock.clock}</Text>
              <Text style={styles.zoneSm} numberOfLines={1}>
                {clock.zone}
              </Text>
            </View>
          </>
        ) : null}
      </View>
      {framed ? null : <Divider />}

      {state.status === "searching" ? (
        <View style={styles.options} testID={`${testIDPrefix}.loading`}>
          <Skeleton width={160} height={24} radius="pill" />
          <Skeleton height={112} radius="md" />
        </View>
      ) : fares.length > 0 ? (
        <View style={styles.options}>
          <Text style={styles.optionsTitle} accessibilityRole="header">
            {flightOptionsTitle(fares.length)}
          </Text>
          {fares.map((fare) => (
            <FlightCard
              key={fare.id}
              testID={`${testIDPrefix}.fare.${fare.id}`}
              fare={fare}
              layout={fares.length === 1 ? "detailed" : "compact"}
              onPress={() => onOpenFare(fare)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** The fare's summary, or what stands in its place: offline (19), searching, paused, an error, no fare. */
function Summary({
  state,
  offline,
  onRetry,
  testIDPrefix,
  compact,
}: {
  state: SearchState;
  offline: boolean;
  onRetry: () => void;
  testIDPrefix: string;
  /** In 04's card the price is a step smaller, so it keeps its basis on its line beside the clock. */
  compact: boolean;
}) {
  if (offline) {
    return (
      <Message
        testID={`${testIDPrefix}.offline`}
        title="You’re offline."
        body="You can still request a fare — it goes out as soon as you’re back online."
        link={{ label: "Try again", onPress: onRetry, testID: `${testIDPrefix}.offline.retry` }}
      />
    );
  }
  if (state.status === "searching" || state.status === "idle") {
    return (
      <View style={styles.lines}>
        <Skeleton width={110} height={12} radius="pill" />
        <Skeleton width={180} height={26} radius="pill" />
        <Skeleton width={200} height={14} radius="pill" />
      </View>
    );
  }
  if (state.status === "error") {
    return (
      <Message
        testID={`${testIDPrefix}.searchError`}
        title="Something went wrong."
        body={state.errorMessage ?? "We could not load the fares."}
        link={{ label: "Try again", onPress: onRetry, testID: `${testIDPrefix}.searchError.retry` }}
      />
    );
  }
  const fares = state.results ?? [];
  if (state.status === "paused" && fares.length === 0) {
    return <Message testID="search.paused" title="Searching paused." body={PAUSED} />;
  }
  if (fares.length > 0) {
    const lowest = fares.reduce((best, fare) => (fare.price.offer < best.price.offer ? fare : best));
    return (
      <View style={styles.lines} testID={`${testIDPrefix}.lowest`}>
        <Text style={styles.label}>LOWEST FARE</Text>
        <PriceLine
          price={`From ${formatPrice(lowest.price.offer, lowest.price.currency)}`}
          basis="one way"
          compact={compact}
        />
        {state.status === "paused" ? <Text style={styles.small}>{PAUSED}</Text> : null}
      </View>
    );
  }
  if (state.estimate) {
    // ADR-IMPL-037: the formula's price for an undated search with no fare — round trip, and never a fare.
    return (
      <View style={styles.lines} testID={`${testIDPrefix}.estimate`}>
        <Text style={styles.label}>INDICATIVE FARE</Text>
        <PriceLine
          price={`From ${formatPrice(state.estimate.amount, state.estimate.currency)}`}
          basis="round trip"
          compact={compact}
        />
        <Text style={styles.small}>Indicative · your specialist confirms the fare.</Text>
      </View>
    );
  }
  const copy = noFareCopy(state.route?.from ?? state.from, state.route?.to ?? state.to);
  return <Message testID={`${testIDPrefix}.empty`} title={copy.title} body={copy.body} />;
}

/** `From $3,900 · round trip` (13): the basis beside the price, or under it as a whole where the line is short. */
function PriceLine({ price, basis, compact }: { price: string; basis: string; compact: boolean }) {
  return (
    <View style={styles.priceLine} accessible accessibilityLabel={`${price}, ${basis}`}>
      <Text style={compact ? styles.priceSm : styles.price}>{price}</Text>
      <Text style={styles.small}>{`·\u00a0${basis.replace(/ /g, "\u00a0")}`}</Text>
    </View>
  );
}

function Message({
  title,
  body,
  link,
  testID,
}: {
  title: string;
  body: string;
  link?: { label: string; onPress: () => void; testID: string };
  testID: string;
}) {
  return (
    <View style={styles.lines} testID={testID}>
      <Text style={styles.messageTitle}>{title}</Text>
      <Text style={styles.small}>{body}</Text>
      {link ? (
        <Pressable
          testID={link.testID}
          accessibilityRole="button"
          accessibilityLabel={link.label}
          hitSlop={10}
          onPress={link.onPress}
          style={({ pressed }) => [styles.linkHit, pressed && styles.pressed]}
        >
          <Text style={styles.link}>{link.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** The destination's clock, re-rendered on the minute; none without the airport's zone. */
function useLocalTime(city: string, tz: string | undefined) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!tz) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(new Date());
      timer = setTimeout(tick, msToNextMinute());
    };
    timer = setTimeout(tick, msToNextMinute());
    return () => clearTimeout(timer);
  }, [tz]);
  return localTime(city, tz, now);
}

const styles = StyleSheet.create({
  // 13: 12 pt between the title, the chips, the rules and the summary; 16 before the flight options.
  root: { gap: tokens.space.sm },
  title: { gap: 2 },
  city: { ...rn(tokens.type.display), color: tokens.colors.textPrimary },
  country: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
  chipsScroll: { marginHorizontal: -tokens.space.gutter, flexGrow: 0 },
  // The chips share the row while they fit (13), and scroll once dated chips do not.
  chips: { flexGrow: 1, flexDirection: "row", gap: tokens.space.xs, paddingHorizontal: tokens.space.gutter },
  summary: { flexDirection: "row", gap: tokens.space.sm, alignItems: "stretch" },
  summaryCard: {
    backgroundColor: tokens.colors.surfaceCard,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
    ...tokens.elevation.card,
  },
  summaryMain: { flex: 1 },
  lines: { gap: tokens.space.xxs },
  label: { ...rn(tokens.type.label), color: tokens.colors.textSecondary },
  priceLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 6 },
  price: { ...rn(tokens.type.price), color: tokens.colors.textPrimary },
  priceSm: { ...rn(tokens.type.priceSm), color: tokens.colors.textPrimary },
  small: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  clock: { gap: tokens.space.xxs },
  clockTime: { ...rn(tokens.type.price), color: tokens.colors.textPrimary },
  clockTimeSm: { ...rn(tokens.type.priceSm), color: tokens.colors.textPrimary },
  zoneSm: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary },
  messageTitle: { ...rn(tokens.type.titleSm), color: tokens.colors.textPrimary },
  linkHit: { alignSelf: "flex-start", marginTop: tokens.space.xxs },
  link: { ...rn(tokens.type.bodyStrong), color: tokens.colors.textPrimary, textDecorationLine: "underline" },
  pressed: { opacity: 0.6 },
  options: { gap: tokens.space.sm },
  optionsTitle: { ...rn(tokens.type.titleSm), color: tokens.colors.textPrimary },
});
