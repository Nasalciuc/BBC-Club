import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { rn } from "../rn-type";
import { tokens } from "../tokens";
import { GLOBE } from "./constants";

export type Pin = { code: string; lat: number; lng: number; hasOffer: boolean; fromPrice: string };

type Props = {
  pins: Pin[];
  home: { lat: number; lng: number } | null;
  selected: string | null;
  onSelect: (code: string) => void;
  size?: number;
};

/** Default mode until Mapbox exists — not a degraded one. Pins by equirectangular projection. */
export function GlobeFallback({ pins, home, selected, onSelect, size = 520 }: Props) {
  const project = (lat: number, lng: number) => {
    const x = size / 2 + ((lng + 60) / 180) * (size / 2) * 0.82;
    const y = size / 2 - ((lat - 40) / 90) * (size / 2) * 0.82;
    return { x, y };
  };
  const sel = pins.find((p) => p.code === selected) ?? null;

  return (
    <View style={[styles.wrap, { width: size, height: size }]} pointerEvents="box-none">
      <LinearGradient
        colors={[...GLOBE.sphere.colors]}
        locations={[...GLOBE.sphere.locations]}
        start={GLOBE.sphere.center}
        end={{ x: 1, y: 1 }}
        style={[styles.sphere, { width: size, height: size, borderRadius: size / 2 }]}
      />
      {home && sel ? (
        <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Path
            d={arc(project(home.lat, home.lng), project(sel.lat, sel.lng))}
            stroke={tokens.colors.textOnDark}
            strokeWidth={GLOBE.arc.width}
            strokeDasharray={GLOBE.arc.dash.join(" ")}
            fill="none"
          />
        </Svg>
      ) : null}
      {pins.map((pin) => {
        const { x, y } = project(pin.lat, pin.lng);
        const spec = pin.code === selected ? GLOBE.pin.selected : pin.hasOffer ? GLOBE.pin.offer : GLOBE.pin.fare;
        const fill = pin.hasOffer || pin.code === selected ? tokens.colors.textOnDark : tokens.colors.textTertiary;
        return (
          <Pressable
            key={pin.code}
            testID={`globe.pin.${pin.code}`}
            accessibilityRole="button"
            accessibilityLabel={`${pin.code}, ${pin.fromPrice}`}
            hitSlop={16}
            onPress={() => onSelect(pin.code)}
            style={[
              styles.pin,
              {
                left: x - spec.size / 2,
                top: y - spec.size / 2,
                width: spec.size,
                height: spec.size,
                borderRadius: spec.size / 2,
                backgroundColor: fill,
                borderWidth: spec.halo,
                borderColor: spec.haloColor,
              },
            ]}
          />
        );
      })}
      {sel ? (
        <View style={[styles.label, { left: project(sel.lat, sel.lng).x - 60, top: project(sel.lat, sel.lng).y - 42 }]}>
          <Text style={styles.labelText}>{`${sel.code} · ${sel.fromPrice}`}</Text>
        </View>
      ) : null}
    </View>
  );
}

function arc(a: { x: number; y: number }, b: { x: number; y: number }) {
  const cx = (a.x + b.x) / 2;
  const cy = Math.min(a.y, b.y) - Math.abs(b.x - a.x) * 0.35;
  return `M${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "center" },
  sphere: { position: "absolute" },
  pin: { position: "absolute" },
  label: {
    position: "absolute",
    backgroundColor: tokens.colors.surfacePage,
    borderRadius: tokens.radius.field,
    paddingHorizontal: tokens.space.sm,
    paddingVertical: tokens.space.xs,
  },
  labelText: { ...rn(tokens.type.caption), color: tokens.colors.textPrimary },
});
