import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { AirportVM } from "@bbc/shared/api/v1/fares";
import { Icon, Photo, rn, tokens } from "@bbc/ui";

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
 * Onboarding's home airport (01): the city's photograph with `New York · JFK` and a round chevron on its foot. Before
 * one is chosen, the same card in light tint asks for it. Either way the card opens the airport search (14).
 */
export function HomeAirportCard({ airport, error, onPress, testID }: Props) {
  const photoFor = usePlacePhotos([airport?.code]);
  const label = airport ? `${airport.city} · ${airport.code}` : null;
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
          <Photo
            source={cardPicture(undefined, photoFor(airport.code), PICTURE_HEADERS)}
            fallback={CLUB_PICTURE}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={["transparent", tokens.colors.photoVeil]}
            locations={[0.4, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.foot}>
            <Icon name="map-pin" size={24} color={tokens.colors.textOnPhoto} strokeWidth={1.75} />
            <Text style={styles.onPhoto} numberOfLines={1}>
              {label}
            </Text>
            <View style={styles.round}>
              <Icon name="chevron" size={18} color={tokens.colors.textPrimary} strokeWidth={2} />
            </View>
          </View>
        </>
      ) : (
        <View style={styles.ask}>
          <Icon name="map-pin" size={28} color={tokens.colors.textPrimary} strokeWidth={1.75} />
          <View style={styles.askText}>
            <Text style={styles.askTitle}>Choose your home airport</Text>
            <Text style={styles.askBody}>City or airport code</Text>
          </View>
          <Icon name="chevron" size={20} color={tokens.colors.textSecondary} strokeWidth={2} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 148,
    borderRadius: tokens.radius.md,
    overflow: "hidden",
    justifyContent: "flex-end",
    backgroundColor: tokens.colors.surfaceTint,
  },
  empty: { height: 72, justifyContent: "center", borderWidth: 1, borderColor: tokens.colors.surfaceTint },
  error: { borderWidth: 1, borderColor: tokens.colors.statusDanger },
  pressed: { opacity: 0.9 },
  foot: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.xs,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
  },
  onPhoto: { ...rn(tokens.type.subtitle), color: tokens.colors.textOnPhoto, flex: 1 },
  round: {
    width: 32,
    height: 32,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.surfaceCard,
    alignItems: "center",
    justifyContent: "center",
    ...tokens.elevation.float,
  },
  ask: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm, paddingHorizontal: tokens.space.md },
  askText: { flex: 1, gap: 2 },
  askTitle: { ...rn(tokens.type.bodyStrong), color: tokens.colors.textPrimary },
  askBody: { ...rn(tokens.type.bodySm), color: tokens.colors.textOnTint },
});
