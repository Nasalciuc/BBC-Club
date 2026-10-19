import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Avatar } from "../primitives/Avatar";
import { Photo, type PhotoSource } from "../primitives/Photo";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  /** The member's name. */
  name: string;
  /** `Flies from JFK`; null — no home airport, no line. */
  home: string | null;
  /** The member's initials (`DR`), in the portrait until the club keeps a photo of them (ADR-IMPL-055 §7). */
  initials: string;
  /** The home city's photograph (ADR-IMPL-043); null — the fallback. */
  image: PhotoSource | null;
  fallback: PhotoSource | null;
  /** `memory` for a satellite view (its terms ask that it not be kept). */
  cachePolicy?: "memory" | "disk";
  /** The safe area's top: the photograph runs under the status bar. */
  topInset: number;
  /** Over the photograph at the right, under the status bar: the round settings button (ADR-IMPL-055 §9). */
  action?: ReactNode;
  testID: string;
};

/** 12: the photograph 96 pt below the safe area; the 120-pt portrait over its foot, two thirds on the photograph. */
const BAND_BELOW_INSET = 96;
const AVATAR = 120;
const AVATAR_OVER = 80;

/** The band's height on a phone with this top inset — for a satellite view asked for at the band's size. */
export function profileBandHeight(topInset: number): number {
  return topInset + BAND_BELOW_INSET;
}

/**
 * The top of Profile (12): the home city's photograph from edge to edge under the status bar, the member's portrait in
 * its white ring over the photograph's foot, the name in `headline` and `Flies from JFK` under it, centred.
 */
export function ProfileHero({
  name,
  home,
  initials,
  image,
  fallback,
  cachePolicy = "disk",
  topInset,
  action,
  testID,
}: Props) {
  return (
    <View testID={testID}>
      <View style={[styles.band, { height: profileBandHeight(topInset) }]}>
        <Photo source={image} fallback={fallback} cachePolicy={cachePolicy} style={StyleSheet.absoluteFill} />
        {action ? <View style={[styles.action, { top: topInset + tokens.space.xs }]}>{action}</View> : null}
      </View>
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Avatar initials={initials} size={AVATAR} testID={`${testID}.avatar`} />
        </View>
        <Text style={styles.name} accessibilityRole="header" numberOfLines={2}>
          {name}
        </Text>
        {home ? <Text style={styles.home}>{home}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { backgroundColor: tokens.colors.surfaceTint },
  action: { position: "absolute", right: tokens.space.gutter },
  identity: { alignItems: "center", paddingHorizontal: tokens.space.gutter, gap: 2 },
  avatar: { marginTop: -AVATAR_OVER, marginBottom: tokens.space.xs },
  name: { ...rn(tokens.type.headline), color: tokens.colors.textPrimary, textAlign: "center" },
  home: { ...rn(tokens.type.bodyLg), color: tokens.colors.textSecondary, textAlign: "center" },
});
