import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from "react-native-svg";

import { rn } from "../rn-type";
import { tokens } from "../tokens";
import { GLOBE_SPEC } from "./globe-logic";
import {
  LABEL,
  MAX_LABEL_SCALE,
  ROUTE_END,
  type Rect,
  type RouteEndKind,
  pinBox,
  pinUnion,
  routeEndFrame,
} from "./pin-labels";

/** The pin and its label as one box, and where the tip sits in it — a MarkerView anchors on the tip. */
export function pinFrame(x: number, y: number, label: Rect | null) {
  const box = pinUnion(x, y, label);
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  return { left: box.left, top: box.top, width, height, tip: { x: x - box.left, y: y - box.top } };
}

type Props = {
  /** The tip's place, in the parent's points (the drawn globe), or 0, 0 inside a MarkerView sized by `pinFrame`. */
  x: number;
  y: number;
  /** The label's lines: the first in `pin`, the rest in `pin-detail`; none — the pin alone. */
  lines: readonly string[];
  /** The label's box from `placeLabels` (same coordinates as x, y); null — left out. */
  label: Rect | null;
  accessibilityLabel: string;
  onPress?: () => void;
  testID: string;
  /** Inside a MarkerView: laid out from 0, 0 instead of absolutely in the globe's frame. */
  inline?: boolean;
};

/**
 * A place on the globe (02, 13): the navy drop pin with its tip on the place and, where there is room, a white label
 * beside its head — the city over its price, or an airport's code at either end of a route. The pin and its label are
 * one target: a tap on either chooses the place.
 */
export function GlobePin({ x, y, lines, label, accessibilityLabel, onPress, testID, inline = false }: Props) {
  const f = pinFrame(x, y, label);
  const pin = pinBox(x, y);
  // A 44-pt target at least (DESIGN.md · Accessibility), grown evenly around the drawn box.
  const slopX = Math.max(0, (GLOBE_SPEC.pin.hit - f.width) / 2);
  const slopY = Math.max(0, (GLOBE_SPEC.pin.hit - f.height) / 2);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={!onPress}
      hitSlop={{ left: slopX, right: slopX, top: slopY, bottom: slopY }}
      style={[
        inline ? null : styles.absolute,
        { width: f.width, height: f.height },
        inline ? null : { left: f.left, top: f.top },
      ]}
    >
      <View style={[styles.absolute, { left: pin.left - f.left, top: pin.top - f.top }]}>
        <DropPin />
      </View>
      {label ? (
        <View
          style={[
            styles.absolute,
            styles.label,
            {
              left: label.left - f.left,
              top: label.top - f.top,
              width: label.right - label.left,
              height: label.bottom - label.top,
            },
          ]}
        >
          {lines.map((line, i) => (
            <Text
              key={i}
              style={i === 0 ? styles.title : styles.detail}
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_LABEL_SCALE}
            >
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * 13: one end of a chosen route — the small pin on the airport in its glow, and its code beside it. Not a target: the
 * route is already chosen, and the back button leaves it.
 */
export function RouteEnd({
  x,
  y,
  code,
  end,
  inline = false,
  testID,
}: {
  /** The tip's place in the parent's points, or 0, 0 inside a MarkerView sized by `routeEndFrame`. */
  x: number;
  y: number;
  code: string;
  end: RouteEndKind;
  inline?: boolean;
  testID: string;
}) {
  const f = routeEndFrame(code, end);
  const { pin, halo, label } = ROUTE_END;
  const at = ROUTE_END[end];
  const headY = f.tip.y - pin.height + pin.head;
  const edge = 0.5;
  return (
    <View
      testID={testID}
      pointerEvents="none"
      accessible
      accessibilityLabel={end === "origin" ? `From ${code}` : `To ${code}`}
      style={[
        inline ? null : styles.absolute,
        { width: f.width, height: f.height },
        inline ? null : { left: x - f.tip.x, top: y - f.tip.y },
      ]}
    >
      <Svg width={halo * 2} height={halo * 2} style={[styles.absolute, { left: f.tip.x - halo, top: headY - halo }]}>
        <Defs>
          <RadialGradient id="route-end-glow" cx={halo} cy={halo} r={halo} gradientUnits="userSpaceOnUse">
            <Stop offset={0.35} stopColor={tokens.colors.surfaceCard} stopOpacity={0.75} />
            <Stop offset={1} stopColor={tokens.colors.surfaceCard} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={halo} cy={halo} r={halo} fill="url(#route-end-glow)" />
      </Svg>
      <Svg
        width={pin.width + edge * 2}
        height={pin.height + edge * 2}
        viewBox={`${-edge} ${-edge} ${pin.width + edge * 2} ${pin.height + edge * 2}`}
        style={[styles.absolute, { left: f.tip.x - pin.width / 2 - edge, top: f.tip.y - pin.height - edge }]}
      >
        <Path
          d="M4.3 10.2Q2.3 8.4.67 6.6A4.3 4.3 0 1 1 7.93 6.6Q6.3 8.4 4.3 10.2Z"
          fill={tokens.colors.primary}
          stroke={tokens.colors.surfaceCard}
          strokeWidth={edge}
        />
      </Svg>
      <View
        style={[
          styles.absolute,
          styles.routeLabel,
          { left: f.tip.x + at.dx, top: f.tip.y + at.dy, height: label.height, paddingHorizontal: label.padX },
        ]}
      >
        <Text style={styles.routeCode} numberOfLines={1} maxFontSizeMultiplier={MAX_LABEL_SCALE}>
          {code}
        </Text>
      </View>
    </View>
  );
}

/** 02: the drop pin, 18 × 25, a white hole 6.5 across in its head. */
function DropPin() {
  const { width, height } = GLOBE_SPEC.pin;
  return (
    <Svg width={width} height={height} viewBox="0 0 18 25">
      <Path d="M9 25Q4.6 19.4 1.56 14.06A9 9 0 1 1 16.44 14.06Q13.4 19.4 9 25Z" fill={tokens.colors.primary} />
      <Circle cx={9} cy={9} r={3.25} fill={tokens.colors.surfaceCard} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  absolute: { position: "absolute" },
  label: {
    backgroundColor: tokens.colors.surfaceCard,
    borderRadius: LABEL.radius,
    paddingLeft: LABEL.padLeft,
    paddingRight: LABEL.padRight,
    paddingVertical: LABEL.padY,
    justifyContent: "center",
    ...tokens.elevation.soft,
  },
  routeLabel: {
    justifyContent: "center",
    backgroundColor: tokens.colors.surfaceCard,
    borderRadius: ROUTE_END.label.radius,
    borderWidth: ROUTE_END.label.border,
    borderColor: tokens.colors.textPrimary,
  },
  routeCode: { ...rn(tokens.type.routePin), color: tokens.colors.textPrimary },
  title: { ...rn(tokens.type.pin), color: tokens.colors.textPrimary },
  detail: { ...rn(tokens.type.pinDetail), color: tokens.colors.textPrimary },
});
