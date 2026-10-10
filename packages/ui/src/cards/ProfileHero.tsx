import { StyleSheet, Text, View } from "react-native";
import { Photo, type PhotoSource } from "../primitives/Photo";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  /** The member's name, in the serif headline. */
  name: string;
  /** `Flies from JFK`; null — no home airport, no pill. */
  home: string | null;
  /** The home city's photo (ADR-IMPL-043); null — the fallback. */
  image: PhotoSource | null;
  fallback: PhotoSource | null;
  /** `memory` for a satellite view (its terms ask that it not be kept). */
  cachePolicy?: "memory" | "disk";
  testID: string;
};

/** Figma 436:1221: the band is 304 pt high, the home airport's pill 36. No token is either. */
const HEIGHT = 304;
const PILL = 36;

/**
 * Figma `Proposal / ProfileHero` (436:1221): identity anchored in the home airport's city, not a member portrait — the
 * city's photograph under a flat `surface-night` scrim at 32 %, the name in `headline`, the home airport on a white pill.
 * The block sits on the band's bottom edge (Figma: 36 pt above it), so a name on two lines at 1.3× still fits.
 */
export function ProfileHero({ name, home, image, fallback, cachePolicy = "disk", testID }: Props) {
  return (
    <View testID={testID} style={styles.band}>
      <Photo source={image} fallback={fallback} cachePolicy={cachePolicy} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.scrim]} />
      <View style={styles.identity}>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
        {home ? (
          <View style={styles.pill}>
            <Text style={styles.pillText}>{home}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { height: HEIGHT, borderRadius: tokens.radius.card, overflow: "hidden" },
  scrim: { backgroundColor: tokens.colors.surfaceNight, opacity: 0.32 },
  identity: {
    position: "absolute",
    left: tokens.space.lg,
    right: tokens.space.lg,
    bottom: tokens.space.lg + tokens.space.sm,
    gap: tokens.space.sm,
    alignItems: "flex-start",
  },
  name: { ...rn(tokens.type.headline), color: tokens.colors.textOnDark },
  pill: {
    minHeight: PILL,
    justifyContent: "center",
    paddingHorizontal: tokens.space.md,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.pill,
  },
  pillText: { ...rn(tokens.type.bodySm), color: tokens.colors.textPrimary },
});
