import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { AirportVM } from "@bbc/shared/api/v1/fares";
import { Icon, Photo, baselineOffset, rn, tokens } from "@bbc/ui";

import { clubHomePhoto } from "@/features/places/club-photos";
import { cardPicture } from "@/features/places/place-photo-logic";
import { CLUB_PICTURE, PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";

type Props = {
  airport: AirportVM | null;
  /** Continue was pressed without an airport: a red border (the words are under the card, in the screen). */
  error: boolean;
  onPress: () => void;
  testID: string;
};

/**
 * 01, measured (card top T, left L): 166.8 tall, radius 12.5, the card shadow; on its foot the pin (a 20-pt box at
 * L+11.1, T+132.9), `New York · JFK` from L+36.9 with its baseline 19 above the foot, and the round chevron — 24.5
 * across, 13 from the right and 12.5 from the foot. The water under the words is darkened from 60 % of the way down.
 */
export const HOME_CARD = { height: 166.8, radius: 12.5 } as const;
const PIN = { size: 20, left: 11.1, top: 132.9 } as const;
const LABEL = { left: 36.9, baseline: HOME_CARD.height - 19 } as const;
const ROUND = { size: 24.5, right: 13, bottom: 12.5, glyph: 16 } as const;
const placeType = tokens.type.onboardPlace;

/**
 * Onboarding's home airport (01): the city's photograph with `New York · JFK` and a round chevron on its foot. Before
 * one is chosen, the same card in light tint asks for it. Either way the card opens the airport search (14).
 */
export function HomeAirportCard({ airport, error, onPress, testID }: Props) {
  const photoFor = usePlacePhotos([airport?.code]);
  const label = airport ? `${airport.city} · ${airport.code}` : null;
  const club = clubHomePhoto(airport?.code);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label ? `Home airport, ${label}. Change` : "Choose your home airport"}
      onPress={onPress}
      style={({ pressed }) => [styles.card, !airport && styles.empty, error && styles.error, pressed && styles.pressed]}
    >
      {airport ? (
        <>
          <View style={styles.clip} pointerEvents="none">
            <Photo
              source={club ? club.source : cardPicture(undefined, photoFor(airport.code), PICTURE_HEADERS)}
              position={club ? { top: club.top } : undefined}
              fallback={CLUB_PICTURE}
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              colors={["transparent", tokens.colors.photoVeil]}
              locations={[0.6, 1]}
              style={styles.veil}
            />
          </View>
          <View style={styles.pin}>
            <Icon name="map-pin" size={PIN.size} color={tokens.colors.textOnPhoto} strokeWidth={1.8} />
          </View>
          <Text style={styles.onPhoto} numberOfLines={1}>
            {label}
          </Text>
          <View style={styles.round}>
            <Icon name="chevron" size={ROUND.glyph} color={tokens.colors.textPrimary} strokeWidth={2.4} />
          </View>
        </>
      ) : (
        <View style={styles.ask}>
          <Icon name="map-pin" size={28} color={tokens.colors.textPrimary} strokeWidth={1.75} />
          <Text style={styles.askTitle}>Choose your home airport</Text>
          <Text style={styles.askBody}>City or airport code</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    height: HOME_CARD.height,
    borderRadius: HOME_CARD.radius,
    backgroundColor: tokens.colors.surfaceTint,
    ...tokens.elevation.card,
  },
  // Before an airport is chosen: the same frame, so nothing under it moves when one is.
  empty: { justifyContent: "center", alignItems: "center" },
  error: { borderWidth: 1, borderColor: tokens.colors.statusDanger },
  pressed: { opacity: 0.9 },
  // The photograph is clipped to the corners by its own frame: the card keeps its shadow outside.
  clip: { ...StyleSheet.absoluteFill, borderRadius: HOME_CARD.radius, overflow: "hidden" },
  // The water under the words darkens toward the foot (the image's veil peaks near two thirds of `photo-veil`).
  veil: { ...StyleSheet.absoluteFill, opacity: 0.65 },
  pin: { position: "absolute", left: PIN.left, top: PIN.top },
  onPhoto: {
    ...rn(placeType),
    color: tokens.colors.textOnPhoto,
    position: "absolute",
    left: LABEL.left,
    right: ROUND.right + ROUND.size + 8,
    top: LABEL.baseline - baselineOffset(placeType),
  },
  round: {
    position: "absolute",
    right: ROUND.right,
    bottom: ROUND.bottom,
    width: ROUND.size,
    height: ROUND.size,
    borderRadius: ROUND.size / 2,
    backgroundColor: tokens.colors.photoButton,
    alignItems: "center",
    justifyContent: "center",
  },
  ask: { alignItems: "center", gap: tokens.space.xs, paddingHorizontal: tokens.space.md },
  askTitle: { ...rn(placeType), color: tokens.colors.textPrimary, textAlign: "center" },
  askBody: { ...rn(tokens.type.questionSub), color: tokens.colors.textOnTint, textAlign: "center" },
});
