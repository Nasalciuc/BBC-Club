import { type ReactNode, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, type TextStyle, View } from "react-native";
import type { FareVM } from "@bbc/shared/api/v1/fares";
import { Chip, FlightCard, Skeleton, baselineOffset, belowBaseline, fareBasis, rn, tokens } from "@bbc/ui";

import { airlineMark } from "@/features/fares/airline-marks";
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
  /** `route`: Explore's sheet over the globe (13, 19) — the summary between two rules; `page`: the destination's page
   *  under its photograph (04) — the summary in a white card, the city's line under its name. */
  look: "route" | "page";
  /** `explore` in Explore's sheet (13), `destination` on the destination's page (04). */
  testIDPrefix: "explore" | "destination";
};

type Role = TextStyle & { fontSize: number; lineHeight: number };
const r = (t: (typeof tokens.type)[keyof typeof tokens.type]) => rn(t) as Role;

/** The margin that puts a line's baseline `pitch` under the one before it (or under the top of what holds it). */
const after = (pitch: number, prev: Role | null, next: Role) =>
  pitch - (prev ? belowBaseline(prev) : 0) - baselineOffset(next);

type Geometry = {
  /** Where the component's own left edge stands on screen (Explore's sheet pads its content by the gutter). */
  inset: number;
  city: { role: Role; baseline: number; left: number };
  sub: { role: Role; baseline: number; left: number; width?: number };
  /** The chips' row: `top` where the image draws it, `afterLine` under the last line above it (its baseline to the
   *  chips' top), so a line more or less moves them with it. */
  chips: { top: number; afterLine: number; left: number; gap: number; look: "route" | "place" };
  /** The summary's top under the chips, its frame and its height for a fare (a rule's top to the next, or the card). */
  summary: {
    top: number;
    height: number;
    card: { left: number; right: number; radius: number } | null;
    rules: { left: number; right: number } | null;
    /** The left column's pen, on screen. */
    left: number;
    label: { role: Role; baseline: number };
    price: { role: Role; baseline: number };
    /** What the price buys after a dot: its baseline `rise` over the price's; the dot `dotGap` after the price's box
     *  and the words `wordsGap` after the dot's. */
    basis: { role: Role; rise: number; dotGap: number; wordsGap: number; tone: "navy" | "slate" };
    /** `Indicative · your specialist confirms the fare.`: the dot `gaps[0]` after `Indicative`, the words `gaps[1]` after
     *  the dot (between the words' boxes). */
    note: { role: Role; baseline: number; gaps: readonly [number, number] };
    clock: {
      left: number;
      label: Role;
      labelBaseline: number;
      time: Role;
      timeBaseline: number;
      zone: Role;
      zoneBaseline: number;
    };
    rule: { left: number; top: number; bottom: number };
  };
  /** The flight options' title: its baseline, and at least `minGap` under the summary's bottom. */
  options: { role: Role; baseline: number; left: number; minGap: number };
  cards: { top: number; left: number; right: number; gap: number };
};

/**
 * 13, in points under the sheet's content (16 under its top edge), x on screen: the city 19.95 in on 45.2, the country
 * on 66.4; the chips from 79.3, 20.3 in, 7.15 apart; the rules 20.5 from either edge, at 122.8 and under the summary;
 * in the summary (from the first rule's top) the label on 23.3, the price on 49.6 with what it buys 1.65 higher, the
 * note on 67.7 — 20.8 in — and the clock's column 275.1 in on 23.3, 48.4 and 68.4 beside the rule at 259.35 (15.7 to
 * 70.1); the summary 86.5 tall; `Flight option` 20.4 in on 241, at least 26.5 under the second rule; the card from
 * 254.5, 16.2 from either edge.
 */
const ROUTE: Geometry = {
  inset: tokens.space.gutter,
  city: { role: r(tokens.type.routeCity), baseline: 45.2, left: 19.95 },
  sub: { role: r(tokens.type.routeCountry), baseline: 66.4, left: 20.8 },
  chips: { top: 79.3, afterLine: 12.9, left: 20.3, gap: 7.15, look: "route" },
  summary: {
    top: 122.8,
    height: 86.5,
    card: null,
    rules: { left: 20.5, right: 20.5 },
    left: 20.8,
    label: { role: r(tokens.type.routeLabel), baseline: 23.3 },
    price: { role: r(tokens.type.routePrice), baseline: 49.6 },
    basis: { role: r(tokens.type.routeBasis), rise: 1.65, dotGap: 7.41, wordsGap: 4.71, tone: "slate" },
    note: { role: r(tokens.type.routeNote), baseline: 67.7, gaps: [4.13, 5.35] },
    clock: {
      left: 275.1,
      label: r(tokens.type.routeTimeLabel),
      labelBaseline: 23.3,
      time: r(tokens.type.routeClock),
      timeBaseline: 48.4,
      zone: r(tokens.type.routeZone),
      zoneBaseline: 68.4,
    },
    rule: { left: 259.35, top: 15.7, bottom: 70.1 },
  },
  options: { role: r(tokens.type.routeOptions), baseline: 241, left: 20.4, minGap: 26.5 },
  cards: { top: 254.5, left: 16.2, right: 16.2, gap: 4.9 },
};

/**
 * 04, in points under the sheet's top edge, x on screen: the city 21.35 in on 49.2, its line 22.8 in on 70.7 and
 * 85.5, 222 wide; the chips from 98.5, 22.1 in, 6.65 apart; the summary's card from 139.5, 11.2 and 11.8 from the edges,
 * 77.6 tall, radius 13 — in it (from its top) the label on 19.9, the price on 44.4 with what it buys on the same line,
 * the note on 63.7, 14.4 in, and the clock's column 303.1 in on 19.9, 38.4 and 50.4 beside the rule at 289.1 (14.1 to
 * 64); `Flight options` 17.9 in on 245.7; the cards from 255.2, as wide as the summary's, 4.9 apart.
 */
const PAGE: Geometry = {
  inset: 0,
  city: { role: r(tokens.type.placeCity), baseline: 49.2, left: 21.35 },
  sub: { role: r(tokens.type.placeAbout), baseline: 70.7, left: 22.8, width: 222 },
  chips: { top: 98.5, afterLine: 12.96, left: 22.1, gap: 6.65, look: "place" },
  summary: {
    top: 139.5,
    height: 77.6,
    card: { left: 11.2, right: 11.8, radius: 13 },
    rules: null,
    left: 11.2 + 14.4,
    label: { role: r(tokens.type.placeLabel), baseline: 19.9 },
    price: { role: r(tokens.type.placePrice), baseline: 44.4 },
    basis: { role: r(tokens.type.placeBasis), rise: 0, dotGap: 5, wordsGap: 6.1, tone: "navy" },
    note: { role: r(tokens.type.placeNote), baseline: 63.7, gaps: [3.69, 4.15] },
    clock: {
      left: 11.2 + 303.1,
      label: r(tokens.type.placeTimeLabel),
      labelBaseline: 19.9,
      time: r(tokens.type.placeClock),
      timeBaseline: 38.4,
      zone: r(tokens.type.placeZone),
      zoneBaseline: 50.4,
    },
    rule: { left: 11.2 + 289.1, top: 14.1, bottom: 64 },
  },
  options: { role: r(tokens.type.placeOptions), baseline: 245.7, left: 17.93, minGap: 26.5 },
  cards: { top: 255.2, left: 11.2, right: 11.8, gap: 4.9 },
};

/**
 * 19: a message in the summary's place — its title on 30.9 from the summary's top, its words from 48.6 every 15.7 and
 * 205 wide, `Try again` on 81.6 — 21.6 in; the summary then 91.7 tall.
 */
const MESSAGE = {
  left: 21.6,
  width: 205,
  title: { role: r(tokens.type.routeMessageTitle), baseline: 30.9 },
  body: { role: r(tokens.type.routeMessage), baseline: 48.6 },
  link: { role: r(tokens.type.routeLink), after: 17.3 },
  height: 91.7,
  /** The column's rule ends this far above the summary's foot when a message makes it taller. */
  ruleFoot: 12.9,
} as const;

const PAUSED = "Searching paused for a moment. Try again shortly.";
/** The note under an indicative fare (13, 04), in its three parts. */
const NOTE = ["Indicative", "·", "your specialist confirms the fare."] as const;

/**
 * A destination (13, 04, 19): the city and its country (13) or its line (04), the trip's three chips, the fare's
 * summary beside the city's local time, then the flight options — one fare as a card of its own (`Flight option`, 13),
 * several as rows (`Flight options`, 04). `Request a quote` is the screen's pill, docked by the screen.
 */
export function DestinationDetails({
  state,
  offline,
  onRetry,
  onEditDates,
  onEditCabin,
  onEditTravelers,
  onOpenFare,
  look,
  testIDPrefix,
}: Props) {
  const g = look === "route" ? ROUTE : PAGE;
  const to = state.route?.to ?? state.to;
  const city = to?.city ?? "";
  const country = countryName(to?.countryCode);
  // 04 writes the destination's line from the catalogue under its name; 13 its country — and 04 too, without a line.
  const line = look === "page" ? (to?.description ?? country) : country;
  const fares = (state.status === "done" || state.status === "paused") && state.results ? state.results : [];
  const clock = useLocalTime(city, state.route?.to.tz);
  const x = (screen: number) => screen - g.inset;
  const s = g.summary;

  const summary = (
    <Summary state={state} offline={offline} onRetry={onRetry} testIDPrefix={testIDPrefix} geometry={g} />
  );
  // A message (19) makes the summary taller; a fare's summary keeps its own height.
  const message = isMessage(state, offline);
  const height = message ? MESSAGE.height : s.height;
  const rule = { top: s.rule.top, bottom: Math.max(s.rule.bottom, height - MESSAGE.ruleFoot) };

  const optionsTop = g.options.baseline - baselineOffset(g.options.role);

  return (
    <View testID={`${testIDPrefix}.details`}>
      <Text
        style={[
          g.city.role,
          styles.navy,
          { marginTop: g.city.baseline - baselineOffset(g.city.role), marginLeft: x(g.city.left) },
        ]}
        accessibilityRole="header"
        numberOfLines={2}
      >
        {city}
      </Text>
      {line ? (
        <Text
          style={[
            g.sub.role,
            styles.slate,
            {
              marginTop: after(g.sub.baseline - g.city.baseline, g.city.role, g.sub.role),
              marginLeft: x(g.sub.left),
              width: g.sub.width,
            },
          ]}
        >
          {line}
        </Text>
      ) : null}

      {/* One row that scrolls sideways to the screen's edges, should dated chips at a larger text size not fit (13). */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[
          styles.chipsScroll,
          {
            marginTop: g.chips.afterLine - belowBaseline(line ? g.sub.role : g.city.role),
            marginLeft: -g.inset,
            marginRight: -g.inset,
          },
        ]}
        contentContainerStyle={[
          styles.chips,
          { gap: g.chips.gap, paddingLeft: g.chips.left, paddingRight: g.chips.left },
        ]}
        testID={`${testIDPrefix}.chips`}
      >
        <Chip
          testID={`${testIDPrefix}.chip.dates`}
          icon="calendar"
          look={g.chips.look}
          label={datesChipLabel(state.dates)}
          onPress={onEditDates}
        />
        <Chip
          testID={`${testIDPrefix}.chip.cabin`}
          icon="seat"
          look={g.chips.look}
          label={cabinLabel(state.cabin)}
          onPress={onEditCabin}
        />
        <Chip
          testID={`${testIDPrefix}.chip.travelers`}
          icon="user"
          look={g.chips.look}
          label={travelersLabel(state.passengers)}
          onPress={onEditTravelers}
        />
      </ScrollView>

      {/* Everything from the summary's top down, measured from where the chips' row would end at its drawn height: a
          taller row (a larger text size) pushes the rest down with it. */}
      <View style={{ marginTop: s.top - g.chips.top - CHIP_HEIGHT[g.chips.look] }}>
        <View
          style={[
            s.card
              ? [
                  styles.card,
                  { marginLeft: x(s.card.left), marginRight: s.card.right - g.inset, borderRadius: s.card.radius },
                ]
              : null,
            { minHeight: height },
          ]}
          testID={`${testIDPrefix}.summary`}
        >
          {s.card ? <View pointerEvents="none" style={[styles.edge, { borderRadius: s.card.radius }]} /> : null}
          {s.rules ? (
            <View style={[styles.rule, styles.ruleTop, { left: x(s.rules.left), right: s.rules.right - g.inset }]} />
          ) : null}
          <View style={{ marginLeft: x(message ? MESSAGE.left : s.left) - (s.card ? x(s.card.left) : 0) }}>
            {summary}
          </View>
          {clock ? (
            <>
              <View
                style={[
                  styles.vrule,
                  {
                    left: x(s.rule.left) - (s.card ? x(s.card.left) : 0),
                    top: rule.top,
                    height: rule.bottom - rule.top,
                  },
                ]}
              />
              <View
                style={[styles.clock, { left: x(s.clock.left) - (s.card ? x(s.card.left) : 0) }]}
                testID={`${testIDPrefix}.localTime`}
              >
                <Text
                  style={[
                    s.clock.label,
                    styles.slate,
                    { marginTop: s.clock.labelBaseline - baselineOffset(s.clock.label) },
                  ]}
                >
                  LOCAL TIME
                </Text>
                <Text
                  style={[
                    s.clock.time,
                    styles.navy,
                    { marginTop: after(s.clock.timeBaseline - s.clock.labelBaseline, s.clock.label, s.clock.time) },
                  ]}
                >
                  {clock.clock}
                </Text>
                <Text
                  style={[
                    s.clock.zone,
                    styles.slate,
                    { marginTop: after(s.clock.zoneBaseline - s.clock.timeBaseline, s.clock.time, s.clock.zone) },
                  ]}
                  numberOfLines={1}
                >
                  {clock.zone}
                </Text>
              </View>
            </>
          ) : null}
        </View>
        {s.rules ? (
          <View style={[styles.rule, { marginLeft: x(s.rules.left), marginRight: s.rules.right - g.inset }]} />
        ) : null}
      </View>

      {state.status === "searching" ? (
        <View
          style={[styles.loading, { marginLeft: x(g.cards.left), marginRight: g.cards.right - g.inset }]}
          testID={`${testIDPrefix}.loading`}
        >
          <Skeleton width={140} height={20} radius="pill" />
          <Skeleton height={look === "route" ? 110.5 : 61.4} radius="md" />
        </View>
      ) : fares.length > 0 ? (
        <Options
          top={optionsTop}
          after={s.top + height + (s.rules ? RULE : 0)}
          geometry={g}
          fares={fares}
          testIDPrefix={testIDPrefix}
          onOpenFare={onOpenFare}
          layout={fares.length === 1 && look === "route" ? "detailed" : "compact"}
        />
      ) : null}
    </View>
  );
}

/** A trip chip's drawn height in each look (`Chip`): where the next row is measured from. */
const CHIP_HEIGHT = { route: 31.3, place: 30 } as const;
/** The rules' line. */
const RULE = 0.5;

/**
 * `Flight option` over one fare (13) or `Flight options` over several (04): the title on its baseline, or lower when
 * the summary above it is taller, and the cards from their own top under it.
 */
function Options({
  top,
  after: above,
  geometry: g,
  fares,
  testIDPrefix,
  onOpenFare,
  layout,
}: {
  top: number;
  after: number;
  geometry: Geometry;
  fares: FareVM[];
  testIDPrefix: string;
  onOpenFare: (fare: FareVM) => void;
  layout: "detailed" | "compact";
}) {
  const role = g.options.role;
  // The title stands where the image draws it, unless the summary reaches lower: then `minGap` under the summary.
  const titleTop = Math.max(top, above + g.options.minGap - baselineOffset(role));
  const cardsMargin = g.cards.top - (top + role.lineHeight);
  return (
    <View>
      <Text
        style={[role, styles.navy, { marginTop: titleTop - above, marginLeft: g.options.left - g.inset }]}
        accessibilityRole="header"
      >
        {flightOptionsTitle(fares.length)}
      </Text>
      <View
        style={{
          marginTop: cardsMargin,
          marginLeft: g.cards.left - g.inset,
          marginRight: g.cards.right - g.inset,
          gap: g.cards.gap,
        }}
      >
        {fares.map((fare) => (
          <FlightCard
            key={fare.id}
            testID={`${testIDPrefix}.fare.${fare.id}`}
            fare={fare}
            layout={layout}
            mark={airlineMark(fare.carrier.code)}
            onPress={() => onOpenFare(fare)}
          />
        ))}
      </View>
    </View>
  );
}

function isMessage(state: SearchState, offline: boolean): boolean {
  if (offline) return true;
  if (state.status === "error") return true;
  const fares = state.results ?? [];
  if (state.status === "paused" && fares.length === 0) return true;
  if (state.status === "searching" || state.status === "idle") return false;
  return fares.length === 0 && !state.estimate;
}

/** The fare's summary, or what stands in its place: offline (19), searching, paused, an error, no fare. */
function Summary({
  state,
  offline,
  onRetry,
  testIDPrefix,
  geometry: g,
}: {
  state: SearchState;
  offline: boolean;
  onRetry: () => void;
  testIDPrefix: string;
  geometry: Geometry;
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
  const s = g.summary;
  if (state.status === "searching" || state.status === "idle") {
    return (
      <View testID={`${testIDPrefix}.summary.loading`}>
        <View style={{ marginTop: s.label.baseline - baselineOffset(s.label.role) }}>
          <Skeleton width={96} height={10} radius="pill" />
        </View>
        <View style={{ marginTop: tokens.space.xs }}>
          <Skeleton width={180} height={22} radius="pill" />
        </View>
        <View style={{ marginTop: tokens.space.xs }}>
          <Skeleton width={200} height={11} radius="pill" />
        </View>
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
      <Fare
        geometry={g}
        testID={`${testIDPrefix}.lowest`}
        price={`From ${formatPrice(lowest.price.offer, lowest.price.currency)}`}
        basis={fareBasis(lowest.trip)}
        note={state.status === "paused" ? PAUSED : null}
      />
    );
  }
  if (state.estimate) {
    // ADR-IMPL-037: the formula's price for an undated search with no fare — round trip, and never a fare.
    return (
      <Fare
        geometry={g}
        testID={`${testIDPrefix}.estimate`}
        price={`From ${formatPrice(state.estimate.amount, state.estimate.currency)}`}
        basis="round trip"
        note={null}
      />
    );
  }
  const copy = noFareCopy(state.route?.from ?? state.from, state.route?.to ?? state.to);
  return <Message testID={`${testIDPrefix}.empty`} title={copy.title} body={copy.body} />;
}

/**
 * `INDICATIVE FARE` · `From $3,900 · round trip` · `Indicative · your specialist confirms the fare.` (13, 04): the lowest
 * fare is indicative until the specialist confirms it, and says what it buys as the catalogue does.
 */
function Fare({
  geometry: g,
  price,
  basis,
  note,
  testID,
}: {
  geometry: Geometry;
  price: string;
  basis: string | null;
  /** In the note's place (`Searching paused…`); null — the indicative note. */
  note: string | null;
  testID: string;
}) {
  const s = g.summary;
  const b = s.basis;
  const tone = b.tone === "navy" ? styles.navy : styles.slate;
  return (
    <View testID={testID}>
      <Text style={[s.label.role, styles.slate, { marginTop: s.label.baseline - baselineOffset(s.label.role) }]}>
        INDICATIVE FARE
      </Text>
      <View
        style={[
          styles.priceLine,
          { marginTop: after(s.price.baseline - s.label.baseline, s.label.role, s.price.role) },
        ]}
        accessible
        accessibilityLabel={basis ? `${price}, ${basis}` : price}
      >
        <Text style={[s.price.role, styles.navy]} numberOfLines={1}>
          {price}
        </Text>
        {basis ? (
          <View
            style={[
              styles.basis,
              { marginTop: baselineOffset(s.price.role) - b.rise - baselineOffset(b.role), marginLeft: b.dotGap },
            ]}
          >
            <Text style={[b.role, tone]}>·</Text>
            <Text style={[b.role, tone, { marginLeft: b.wordsGap }]} numberOfLines={1}>
              {basis}
            </Text>
          </View>
        ) : null}
      </View>
      {note ? (
        <Text
          style={[
            s.note.role,
            styles.slate,
            { marginTop: after(s.note.baseline - s.price.baseline, s.price.role, s.note.role) },
          ]}
        >
          {note}
        </Text>
      ) : (
        <View
          style={[styles.note, { marginTop: after(s.note.baseline - s.price.baseline, s.price.role, s.note.role) }]}
          accessible
          accessibilityLabel={`${NOTE[0]}. ${NOTE[2]}`}
        >
          <Text style={[s.note.role, styles.slate]}>{NOTE[0]}</Text>
          <Text style={[s.note.role, styles.slate, { marginLeft: s.note.gaps[0] }]}>{NOTE[1]}</Text>
          <Text style={[s.note.role, styles.slate, styles.noteWords, { marginLeft: s.note.gaps[1] }]}>{NOTE[2]}</Text>
        </View>
      )}
    </View>
  );
}

/** 19: a message in the summary's place — a Bold title, the words in slate and an underlined `Try again`. */
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
}): ReactNode {
  const m = MESSAGE;
  return (
    <View style={{ width: m.width }} testID={testID}>
      <Text style={[m.title.role, styles.navy, { marginTop: m.title.baseline - baselineOffset(m.title.role) }]}>
        {title}
      </Text>
      <Text
        style={[
          m.body.role,
          styles.slate,
          { marginTop: after(m.body.baseline - m.title.baseline, m.title.role, m.body.role) },
        ]}
      >
        {body}
      </Text>
      {link ? (
        <Pressable
          testID={link.testID}
          accessibilityRole="button"
          accessibilityLabel={link.label}
          hitSlop={12}
          onPress={link.onPress}
          style={({ pressed }) => [
            styles.linkHit,
            { marginTop: after(m.link.after, m.body.role, m.link.role) },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[m.link.role, styles.link]}>{link.label}</Text>
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
  navy: { color: tokens.colors.textPrimary },
  slate: { color: tokens.colors.textSecondary },
  chipsScroll: { flexGrow: 0 },
  chips: { flexDirection: "row" },
  card: { backgroundColor: tokens.colors.surfaceCard, ...tokens.elevation.card },
  // The hairline over the card's edge: drawn on top, it does not move what is measured from the card's corner.
  edge: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.borderFaint,
  },
  rule: { height: RULE, backgroundColor: tokens.colors.borderFaint },
  ruleTop: { position: "absolute", top: 0 },
  vrule: { position: "absolute", width: RULE, backgroundColor: tokens.colors.borderFaint },
  clock: { position: "absolute", top: 0 },
  priceLine: { flexDirection: "row", alignItems: "flex-start" },
  basis: { flexDirection: "row", flexShrink: 1 },
  note: { flexDirection: "row", flexWrap: "wrap" },
  noteWords: { flexShrink: 1 },
  linkHit: { alignSelf: "flex-start" },
  link: { color: tokens.colors.textPrimary, textDecorationLine: "underline" },
  pressed: { opacity: 0.6 },
  loading: { marginTop: tokens.space.lg, gap: tokens.space.sm },
});
