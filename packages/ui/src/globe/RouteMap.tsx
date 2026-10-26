import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { Icon } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";
import { landFor } from "./land";
import { routeMap } from "./route-map-logic";

type Place = { code: string; city: string; lat: number; lng: number };

type Props = {
  from: Place;
  to: Place;
  height?: number;
  testID?: string;
};

/** The labels beside each end: as wide as the card's side room (route-map-logic's pad). */
const LABEL_WIDTH = 64;

/**
 * The route card's map (05; sheet 40 · 08): the land in white on the pale sky, the flight's great circle dashed in navy
 * with the plane at its middle, a navy dot at each airport with its code over its city — drawn from the same Natural
 * Earth land as the globe, no tiles, no network.
 */
export function RouteMap({ from, to, height = 112, testID }: Props) {
  const [width, setWidth] = useState(0);
  const map = width > 0 ? routeMap([from.lng, from.lat], [to.lng, to.lat], landFor("mid"), { width, height }) : null;
  const westFirst = map ? map.from[0] <= map.to[0] : true;
  return (
    <View
      testID={testID}
      style={[styles.map, { height }]}
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
            <Path d={map.land} fill={tokens.colors.surfaceCard} />
            <Path
              d={map.route}
              fill="none"
              stroke={tokens.colors.primary}
              strokeWidth={1.5}
              strokeDasharray={[5, 4]}
              strokeLinecap="round"
            />
            {[map.from, map.to].map(([x, y], i) => (
              <Circle
                key={i}
                cx={x}
                cy={y}
                r={4.5}
                fill={tokens.colors.primary}
                stroke={tokens.colors.surfaceCard}
                strokeWidth={1.5}
              />
            ))}
          </Svg>
          {map.plane ? (
            <View
              style={[
                styles.plane,
                {
                  left: map.plane.at[0] - 9,
                  top: map.plane.at[1] - 9,
                  transform: [{ rotate: `${map.plane.angle + 90}deg` }],
                },
              ]}
            >
              <Icon name="plane-fill" size={18} color={tokens.colors.primary} />
            </View>
          ) : null}
          <End place={from} at={map.from} side={westFirst ? "left" : "right"} />
          <End place={to} at={map.to} side={westFirst ? "right" : "left"} />
        </>
      ) : null}
    </View>
  );
}

function End({ place, at, side }: { place: Place; at: readonly [number, number]; side: "left" | "right" }) {
  return (
    <View
      style={[
        styles.end,
        side === "left" ? { left: at[0] - 8 - LABEL_WIDTH, alignItems: "flex-end" } : { left: at[0] + 8 },
        { top: at[1] - 30 },
      ]}
    >
      <Text style={styles.code}>{place.code}</Text>
      <Text style={styles.city} numberOfLines={1}>
        {place.city}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { borderRadius: tokens.radius.sm, overflow: "hidden", backgroundColor: tokens.colors.sky },
  plane: { position: "absolute", width: 18, height: 18 },
  end: { position: "absolute", width: LABEL_WIDTH },
  code: { ...rn(tokens.type.labelStrong), color: tokens.colors.textPrimary },
  city: { ...rn(tokens.type.caption), color: tokens.colors.textPrimary },
});
