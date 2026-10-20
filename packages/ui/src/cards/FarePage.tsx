import { useState } from "react";
import { Image, type ImageSourcePropType, Pressable, StyleSheet, Text, type TextStyle, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import type { FareVM } from "@bbc/shared/api/v1/fares";
import type { PricePair } from "@bbc/shared/api/v1/proposals";

import { Icon, WeatherMark } from "../icons";
import { Photo, type PhotoSource } from "../primitives/Photo";
import { baselineOffset, belowBaseline, rn } from "../rn-type";
import { tokens } from "../tokens";
import { landFor } from "../globe/land";
import { routeMap } from "../globe/route-map-logic";
import { arriveYmd, dayText, departYmd } from "./flight-facts";

type Role = TextStyle & { fontSize: number; lineHeight: number };
const r = (t: (typeof tokens.type)[keyof typeof tokens.type]) => rn(t) as Role;

/** The margin that puts a line's baseline `pitch` under the one before it (or under the top of what holds it). */
const after = (pitch: number, prev: Role | null, next: Role) =>
  pitch - (prev ? belowBaseline(prev) : 0) - baselineOffset(next);
const topOf = (baseline: number, role: Role) => baseline - baselineOffset(role);

const money = (n: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

/** The destination's weather over the trip's days, as the weather service gives it (05). */
export type FareWeather = { place: string; temperature: string; summary: string; dates: string };

/**
 * 05, from the card's top-left (364.4 × 73.3, radius 10, the neutral grey): the weather mark 9.2 in and 12.9 down,
 * 34.1 tall; `London weather` 60.2 in on 21.15, `12°` on 48, its summary and days 5.9 after it on 40.2 and 53.7; the
 * rule at 178.2 from 11.1 to 62.8; `Your fare` 193.1 in on 21.15, the price on 46.1, what it is down from on 62.9; the
 * `Save` pill 24.45 down, 22.6 tall, 7.4 from the right, its words 9.7 either side.
 */
const SUMMARY = {
  height: 73.3,
  radius: 10,
  mark: { left: 9.2, top: 12.9, height: 34.1 },
  weather: { left: 60.2, label: 21.15, temp: 48, sideGap: 5.93, summary: 40.2, dates: 53.7 },
  rule: { left: 178.2, top: 11.1, bottom: 62.8 },
  // The fare's column runs 5 short of the card's edge: `Down from $7,550 · Sabre · 16 Sep` keeps 05's one line.
  fare: { left: 193.1, alone: 15, right: 5, label: 21.15, price: 46.1, down: 62.9 },
  save: { top: 24.45, height: 22.6, right: 7.4, pad: 9.7 },
} as const;
const SMALL = r(tokens.type.fareSmall);
const TEMP = r(tokens.type.fareTemp);
const WEATHER = r(tokens.type.fareWeather);
const AMOUNT = r(tokens.type.fareAmount);
const DOWN = r(tokens.type.fareDown);
const SAVE = r(tokens.type.fareSave);

/**
 * The weather beside the fare (05): the mark, the place's weather, the temperature, its summary over the trip's days
 * — where the club has a weather service; then the fare, what the published one was and where it was published, and
 * `Save 48%` where that fare is on record. Without the weather, the fare alone.
 */
export function FareSummaryCard({
  price,
  percent,
  weather,
  testID,
}: {
  price: Pick<PricePair, "offer" | "published" | "publishedSource" | "currency">;
  percent: number | null;
  weather: FareWeather | null;
  testID?: string;
}) {
  const g = SUMMARY;
  const amount = money(price.offer, price.currency);
  const published = price.published != null ? money(price.published, price.currency) : null;
  const source = published ? price.publishedSource?.trim() || null : null;
  const down = published ? [`Down from ${published}`, source].filter(Boolean).join(" · ") : null;
  const left = weather ? g.fare.left : g.fare.alone;
  return (
    <View
      style={[styles.summary, { minHeight: g.height, borderRadius: g.radius }]}
      testID={testID}
      accessible
      accessibilityLabel={[
        weather ? `${weather.place} weather ${weather.temperature}, ${weather.summary}, ${weather.dates}` : null,
        `Your fare ${amount}`,
        down,
        percent ? `save ${percent}%` : null,
      ]
        .filter(Boolean)
        .join(", ")}
    >
      {weather ? (
        <>
          <View style={[styles.absolute, { left: g.mark.left, top: g.mark.top }]}>
            <WeatherMark height={g.mark.height} />
          </View>
          <View style={[styles.absolute, { left: g.weather.left, top: 0 }]}>
            <Text
              style={[SMALL, styles.navy, { marginTop: topOf(g.weather.label, SMALL) }]}
            >{`${weather.place} weather`}</Text>
            <View style={styles.row}>
              <Text style={[TEMP, styles.navy, { marginTop: after(g.weather.temp - g.weather.label, SMALL, TEMP) }]}>
                {weather.temperature}
              </Text>
              <View style={{ marginLeft: g.weather.sideGap }}>
                <Text
                  style={[
                    WEATHER,
                    styles.slate,
                    {
                      marginTop: topOf(g.weather.summary, WEATHER) - (topOf(g.weather.label, SMALL) + SMALL.lineHeight),
                    },
                  ]}
                >
                  {weather.summary}
                </Text>
                <Text
                  style={[
                    WEATHER,
                    styles.slate,
                    { marginTop: after(g.weather.dates - g.weather.summary, WEATHER, WEATHER) },
                  ]}
                >
                  {weather.dates}
                </Text>
              </View>
            </View>
          </View>
          <View style={[styles.vrule, { left: g.rule.left, top: g.rule.top, height: g.rule.bottom - g.rule.top }]} />
        </>
      ) : null}
      <View style={{ marginLeft: left, marginRight: g.fare.right }}>
        <Text style={[SMALL, styles.navy, { marginTop: topOf(g.fare.label, SMALL) }]}>Your fare</Text>
        <Text
          style={[AMOUNT, styles.navy, { marginTop: after(g.fare.price - g.fare.label, SMALL, AMOUNT) }]}
          numberOfLines={1}
        >
          {amount}
        </Text>
        {down ? (
          <Text
            style={[DOWN, styles.slate, { marginTop: after(g.fare.down - g.fare.price, AMOUNT, DOWN) }]}
            numberOfLines={2}
          >
            {down}
          </Text>
        ) : null}
      </View>
      {percent ? (
        <View
          style={[
            styles.save,
            { top: g.save.top, right: g.save.right, height: g.save.height, borderRadius: g.save.height / 2 },
            { paddingHorizontal: g.save.pad },
          ]}
        >
          <Text style={[SAVE, styles.navy]}>{`Save ${percent}%`}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * 05, from the card's top-left (363.9 × 89.8, radius 10): `Flight overview` 13 in on 22.2; the airline's mark
 * centred on 48.1, 45.2 and its name under it on 66.8; the departure 138.5 in and the arrival 299.85 in — each its code
 * on 36.6, its city on 50.1, its clock on 66.2 and its day on 78.2; the line on 32.6 from 185.2 to 220.7 and from 245.6
 * to 281.6, the plane between them on 233.4; `+1` 3.8 after the clock, 1.3 over its baseline.
 */
const OVERVIEW = {
  height: 89.8,
  radius: 10,
  title: { role: r(tokens.type.fareCardTitle), left: 13, baseline: 22.2 },
  // The ribbon drawn 1.25 times its crop (04's logo, where it is smaller).
  airline: { centre: 48.1, mark: 45.2, name: 66.8, role: r(tokens.type.fareAirline), width: 70, ribbonScale: 1.25 },
  depart: 138.5,
  arrive: 299.85,
  code: { role: r(tokens.type.fareCode), baseline: 36.6 },
  city: { role: r(tokens.type.fareCity), baseline: 50.1 },
  time: { role: r(tokens.type.fareTime), baseline: 66.2 },
  day: { role: r(tokens.type.fareDay), baseline: 78.2 },
  plus: { role: r(tokens.type.farePlus), gap: 3.8, rise: 1.3 },
  line: { y: 32.6, a: [185.2, 220.7], b: [245.6, 281.6], plane: 233.4, size: 20.3 },
} as const;

/** The speedmarque alone (05): the British Airways crop's ribbon, its wordmark left outside the window. */
export type AirlineRibbon = {
  source: ImageSourcePropType;
  /** The crop's size, and the window that shows only the ribbon (its left, top, width and height in the crop). */
  width: number;
  height: number;
  window: { left: number; top: number; width: number; height: number };
};

/**
 * `Flight overview` (05): the airline — its mark over its name — beside both airports, each its code over its city,
 * its clock and its day, the plane on the line between them.
 */
export function FareOverviewCard({
  fare,
  ribbon,
  testID,
}: {
  fare: FareVM;
  ribbon?: AirlineRibbon | null;
  testID?: string;
}) {
  const g = OVERVIEW;
  const k = g.airline.ribbonScale;
  const plusDays = fare.arriveDayOffset > 0 ? `+${fare.arriveDayOffset}` : null;
  return (
    <View style={[styles.card, { minHeight: g.height, borderRadius: g.radius }]} testID={testID}>
      <Text
        style={[
          g.title.role,
          styles.navy,
          styles.absolute,
          { left: g.title.left, top: topOf(g.title.baseline, g.title.role) },
        ]}
        accessibilityRole="header"
      >
        Flight overview
      </Text>
      <View
        style={[
          styles.absolute,
          styles.airline,
          { left: g.airline.centre - g.airline.width / 2, width: g.airline.width },
        ]}
      >
        {ribbon ? (
          <View
            style={[
              styles.window,
              {
                width: ribbon.window.width * k,
                height: ribbon.window.height * k,
                marginTop: g.airline.mark - (ribbon.window.height * k) / 2,
              },
            ]}
          >
            <Image
              source={ribbon.source}
              style={[
                styles.ribbon,
                {
                  width: ribbon.width * k,
                  height: ribbon.height * k,
                  left: -ribbon.window.left * k,
                  top: -ribbon.window.top * k,
                },
              ]}
              accessibilityIgnoresInvertColors
            />
          </View>
        ) : null}
        <Text
          style={[
            g.airline.role,
            styles.slate,
            styles.centre,
            {
              marginTop: ribbon
                ? topOf(g.airline.name, g.airline.role) - (g.airline.mark + (ribbon.window.height * k) / 2)
                : topOf(g.airline.name, g.airline.role),
            },
          ]}
          numberOfLines={2}
        >
          {fare.carrier.name}
        </Text>
      </View>
      <Leg
        left={g.depart}
        code={fare.from.code}
        city={fare.from.city}
        time={fare.departLocal}
        day={dayText(departYmd(fare))}
      />
      <View style={[styles.hline, { top: g.line.y, left: g.line.a[0], width: g.line.a[1] - g.line.a[0] }]} />
      <View style={[styles.hline, { top: g.line.y, left: g.line.b[0], width: g.line.b[1] - g.line.b[0] }]} />
      <View
        style={[styles.absolute, { left: g.line.plane - g.line.size / 2, top: g.line.y + RULE / 2 - g.line.size / 2 }]}
        importantForAccessibility="no-hide-descendants"
      >
        <Icon name="plane-right-fill" size={g.line.size} color={tokens.colors.textPrimary} />
      </View>
      <Leg
        left={g.arrive}
        code={fare.to.code}
        city={fare.to.city}
        time={fare.arriveLocal}
        day={dayText(arriveYmd(fare))}
        plusDays={plusDays}
      />
      <CardEdge radius={g.radius} />
    </View>
  );
}

/** The card's hairline, drawn over its edge: it does not move what is measured from the card's corner. */
function CardEdge({ radius }: { radius: number }) {
  return <View pointerEvents="none" style={[styles.edge, { borderRadius: radius }]} />;
}

const RULE = 0.5;

function Leg({
  left,
  code,
  city,
  time,
  day,
  plusDays = null,
}: {
  left: number;
  code: string;
  city: string;
  time: string | null;
  day: string | null;
  plusDays?: string | null;
}) {
  const g = OVERVIEW;
  const spoken = [code, city, time ? `${time}${plusDays ? `, ${plusDays} day` : ""}` : null, day]
    .filter(Boolean)
    .join(", ");
  return (
    <View style={[styles.absolute, { left, top: 0 }]} accessible accessibilityLabel={spoken}>
      <Text style={[g.code.role, styles.navy, { marginTop: topOf(g.code.baseline, g.code.role) }]}>{code}</Text>
      <Text
        style={[
          g.city.role,
          styles.slate,
          { marginTop: after(g.city.baseline - g.code.baseline, g.code.role, g.city.role) },
        ]}
        numberOfLines={1}
      >
        {city}
      </Text>
      {time ? (
        <View style={styles.row}>
          <Text
            style={[
              g.time.role,
              styles.navy,
              { marginTop: after(g.time.baseline - g.city.baseline, g.city.role, g.time.role) },
            ]}
          >
            {time}
          </Text>
          {plusDays ? (
            <Text
              style={[
                g.plus.role,
                styles.slate,
                {
                  marginLeft: g.plus.gap,
                  marginTop:
                    after(g.time.baseline - g.city.baseline, g.city.role, g.time.role) +
                    baselineOffset(g.time.role) -
                    g.plus.rise -
                    baselineOffset(g.plus.role),
                },
              ]}
            >
              {plusDays}
            </Text>
          ) : null}
        </View>
      ) : null}
      {time && day ? (
        <Text
          style={[
            g.day.role,
            styles.slate,
            { marginTop: after(g.day.baseline - g.time.baseline, g.time.role, g.day.role) },
          ]}
          numberOfLines={1}
        >
          {day}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * 05, from the card's top-left (363.9 × 121.1, radius 9): `The route` 12.9 in on 21.4; the map 28.8 down, 9.4 and 9.5
 * from the sides, 6.9 above the foot, radius 8.5 — the ocean light azure, the land near-white; the route dashed in
 * navy (3.2 on, 2.9 off, 1 pt), the plane at its middle, a navy dot 6.5 across at each airport with its code over its
 * city 7.4 beside it.
 */
const ROUTE = {
  height: 121.1,
  radius: 9,
  title: { role: r(tokens.type.fareCardTitle), left: 12.9, baseline: 21.4 },
  map: { top: 28.8, left: 9.4, right: 9.5, bottom: 6.9, height: 85.4, radius: 8.5 },
  dot: 3.25,
  gap: 7.4,
  code: { role: r(tokens.type.mapCode), rise: 2.55 },
  city: { role: r(tokens.type.mapCity), drop: 7.35 },
  plane: 16.5,
  pad: { x: 62, top: 24, bottom: 20 },
} as const;
const LABEL_WIDTH = 64;

type Place = { code: string; city: string; lat: number; lng: number };

/** `The route` (05): the flight drawn on the land, the airports at either end. */
export function FareRouteCard({ from, to, testID }: { from: Place; to: Place; testID?: string }) {
  const g = ROUTE;
  const [width, setWidth] = useState(0);
  const height = g.map.height;
  const map =
    width > 0 ? routeMap([from.lng, from.lat], [to.lng, to.lat], landFor("mid"), { width, height }, g.pad) : null;
  const westFirst = map ? map.from[0] <= map.to[0] : true;
  return (
    <View style={[styles.card, { minHeight: g.height, borderRadius: g.radius }]} testID={testID}>
      <Text
        style={[
          g.title.role,
          styles.navy,
          { marginLeft: g.title.left, marginTop: topOf(g.title.baseline, g.title.role) },
        ]}
        accessibilityRole="header"
      >
        The route
      </Text>
      <View
        style={[
          styles.map,
          {
            height,
            borderRadius: g.map.radius,
            marginLeft: g.map.left,
            marginRight: g.map.right,
            marginBottom: g.map.bottom,
            marginTop: g.map.top - (topOf(g.title.baseline, g.title.role) + g.title.role.lineHeight),
          },
        ]}
        onLayout={(e) => {
          const next = Math.round(e.nativeEvent.layout.width);
          if (next !== width) setWidth(next);
        }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`The route from ${from.city} to ${to.city}`}
      >
        {map ? (
          <>
            <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
              <Path d={map.land} fill={tokens.colors.mapLand} />
              <Path
                d={map.route}
                fill="none"
                stroke={tokens.colors.primary}
                strokeWidth={1}
                strokeDasharray={[3.2, 2.9]}
              />
              {[map.from, map.to].map(([x, y], i) => (
                <Circle key={i} cx={x} cy={y} r={g.dot} fill={tokens.colors.primary} />
              ))}
            </Svg>
            {map.plane ? (
              <View
                style={[
                  styles.absolute,
                  {
                    left: map.plane.at[0] - g.plane / 2,
                    top: map.plane.at[1] - g.plane / 2,
                    transform: [{ rotate: `${map.plane.angle + 90}deg` }],
                  },
                ]}
              >
                <Icon name="plane-fill" size={g.plane} color={tokens.colors.primary} />
              </View>
            ) : null}
            <End place={from} at={map.from} side={westFirst ? "left" : "right"} />
            <End place={to} at={map.to} side={westFirst ? "right" : "left"} />
          </>
        ) : null}
      </View>
      <CardEdge radius={g.radius} />
    </View>
  );
}

function End({ place, at, side }: { place: Place; at: readonly [number, number]; side: "left" | "right" }) {
  const g = ROUTE;
  const codeTop = at[1] - g.code.rise - baselineOffset(g.code.role);
  return (
    <View
      style={[
        styles.absolute,
        { width: LABEL_WIDTH, top: codeTop },
        side === "left"
          ? { left: at[0] - g.dot - g.gap - LABEL_WIDTH, alignItems: "flex-end" }
          : { left: at[0] + g.dot + g.gap },
      ]}
    >
      <Text style={[g.code.role, styles.navy]}>{place.code}</Text>
      <Text
        style={[g.city.role, styles.navy, { marginTop: after(g.code.rise + g.city.drop, g.code.role, g.city.role) }]}
        numberOfLines={1}
      >
        {place.city}
      </Text>
    </View>
  );
}

/**
 * 05: the photographs under the hero — 115.5 × 59.4, radius 10, 5.15 apart, in a white edge (1.4 pt around the one shown,
 * 0.9 around the others) — and the dots under them: 6.5 across in navy for the one shown, 6 in light navy for the
 * others, 13 apart.
 */
const THUMB = { width: 115.5, height: 59.4, gap: 5.15, radius: 10, edge: 1.4, edgeOff: 0.9 } as const;
const DOT = { on: 6.5, off: 6, pitch: 13 } as const;

export function PhotoThumbs({
  photos,
  current,
  onSelect,
  testID,
}: {
  photos: readonly { source: PhotoSource | null; label: string }[];
  current: number;
  onSelect: (index: number) => void;
  testID: string;
}) {
  return (
    <View style={styles.thumbs} testID={testID}>
      {photos.map((p, i) => {
        const on = i === current;
        return (
          <Pressable
            key={i}
            testID={`${testID}.${i}`}
            accessibilityRole="button"
            accessibilityLabel={p.label}
            accessibilityState={{ selected: on }}
            onPress={() => onSelect(i)}
            hitSlop={4}
            style={[styles.thumb, { borderWidth: on ? THUMB.edge : THUMB.edgeOff }, on ? tokens.elevation.soft : null]}
          >
            <Photo source={p.source} fallback={null} style={styles.thumbPhoto} />
          </Pressable>
        );
      })}
    </View>
  );
}

export function PageDots({ count, current, testID }: { count: number; current: number; testID?: string }) {
  return (
    <View
      style={styles.dots}
      testID={testID}
      accessible
      accessibilityLabel={`Photo ${current + 1} of ${count}`}
      importantForAccessibility="yes"
    >
      {Array.from({ length: count }, (_, i) => {
        const size = i === current ? DOT.on : DOT.off;
        return (
          <View
            key={i}
            style={[
              styles.dot,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: i === current ? tokens.colors.primary : tokens.colors.progressTrack,
                marginLeft: i === 0 ? 0 : DOT.pitch - (size + (i - 1 === current ? DOT.on : DOT.off)) / 2,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  absolute: { position: "absolute" },
  row: { flexDirection: "row", alignItems: "flex-start" },
  navy: { color: tokens.colors.textPrimary },
  slate: { color: tokens.colors.textSecondary },
  centre: { textAlign: "center" },
  summary: { backgroundColor: tokens.colors.surfaceNeutral },
  vrule: { position: "absolute", width: StyleSheet.hairlineWidth, backgroundColor: tokens.colors.ruleLine },
  save: { position: "absolute", justifyContent: "center", backgroundColor: tokens.colors.surfaceTintBlue },
  card: { backgroundColor: tokens.colors.surfaceCard, ...tokens.elevation.soft },
  edge: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.borderFaint,
  },
  airline: { top: 0, alignItems: "center" },
  window: { overflow: "hidden" },
  ribbon: { position: "absolute", mixBlendMode: "multiply" },
  hline: { position: "absolute", height: StyleSheet.hairlineWidth, backgroundColor: tokens.colors.ruleLine },
  map: { overflow: "hidden", backgroundColor: tokens.colors.mapOcean },
  thumbs: { flexDirection: "row", gap: THUMB.gap },
  thumb: {
    width: THUMB.width,
    height: THUMB.height,
    borderRadius: THUMB.radius,
    borderColor: tokens.colors.surfaceCard,
    overflow: "hidden",
    backgroundColor: tokens.colors.surfaceCard,
  },
  thumbPhoto: { flex: 1, borderRadius: THUMB.radius - THUMB.edgeOff },
  dots: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  dot: {},
});
