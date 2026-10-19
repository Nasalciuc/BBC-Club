import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Avatar } from "../primitives/Avatar";
import { Photo, type PhotoSource } from "../primitives/Photo";
import { baselineOffset, belowBaseline, rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  /** The member's name. */
  name: string;
  /** `Flies from JFK`; null — no home airport, no line. */
  home: string | null;
  /** The member's initials (`DR`), in the portrait until the club keeps a photo of them. */
  initials: string;
  /** The member's photo (`ProfileVM.avatarUrl`); null — the initials. */
  portrait?: PhotoSource | null;
  /** The home city's photograph (ADR-IMPL-043, ADR-IMPL-056); null — the fallback. */
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

/**
 * 12, measured on a 47-pt status bar: the photograph 95.3 pt under the safe area; the 113.6-pt portrait in its 3.8-pt
 * white ring, 75.8 of it on the photograph; the name's baseline 63.4 pt under the photograph's foot, `Flies from JFK`
 * 16.6 under it, centred.
 */
const BAND_BELOW_INSET = 95.3;
const AVATAR = 113.6;
const AVATAR_OVER = 75.8;
const NAME_BASELINE = 63.4;
const HOME_PITCH = 16.6;

/** The band's height on a phone with this top inset — for a satellite view asked for at the band's size. */
export function profileBandHeight(topInset: number): number {
  return topInset + BAND_BELOW_INSET;
}

/** Where the identity block ends under the photograph's foot: what follows on Profile is measured from there. */
export const PROFILE_HOME_BASELINE = NAME_BASELINE + HOME_PITCH;

/**
 * The top of Profile (12): the home city's photograph from edge to edge under the status bar, the member's portrait in
 * its white ring over the photograph's foot, the name and where they fly from under it, centred.
 */
export function ProfileHero({
  name,
  home,
  initials,
  portrait = null,
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
        {action ? <View style={[styles.action, { top: topInset + 5.1 - 35 / 2 }]}>{action}</View> : null}
      </View>
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Avatar initials={initials} photo={portrait} size={AVATAR} testID={`${testID}.avatar`} />
        </View>
        <Text style={styles.name} accessibilityRole="header" numberOfLines={2}>
          {name}
        </Text>
        {home ? <Text style={styles.home}>{home}</Text> : null}
      </View>
    </View>
  );
}

const nameType = tokens.type.profileName;
const homeType = tokens.type.profileHome;

const styles = StyleSheet.create({
  band: { backgroundColor: tokens.colors.surfaceTint },
  action: { position: "absolute", right: 19.2 },
  identity: { alignItems: "center", paddingHorizontal: tokens.space.gutter },
  avatar: { marginTop: -AVATAR_OVER },
  name: {
    ...rn(nameType),
    color: tokens.colors.textPrimary,
    textAlign: "center",
    marginTop: NAME_BASELINE - (AVATAR - AVATAR_OVER) - baselineOffset(nameType),
  },
  home: {
    ...rn(homeType),
    color: tokens.colors.textOnTint,
    textAlign: "center",
    marginTop: HOME_PITCH - belowBaseline(nameType) - baselineOffset(homeType),
  },
});
