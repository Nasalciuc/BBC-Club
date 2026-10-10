import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Photo, type PhotoSource } from "../primitives/Photo";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  title: string;
  fromPrice?: string | null;
  /** The offer's own picture, else its city's photo (ADR-IMPL-043); null — the fallback. */
  image: PhotoSource | null;
  /** The club's own image, when there is no photo or it cannot load. */
  fallback: PhotoSource | null;
  onPress: () => void;
  testID: string;
};

/** Carousel card 180 × 120. Scrim is the one gradient DESIGN.md permits over a photograph. */
export function OfferCard({ title, fromPrice, image, fallback, onPress, testID }: Props) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={fromPrice ? `${title}, ${fromPrice}` : title}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Photo source={image} fallback={fallback} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={["transparent", tokens.colors.scrim]}
        locations={[0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {/* Figma 89:389: an offer without a price reads EXPLORE in the price slot. */}
        <Text style={styles.price}>{fromPrice ?? "EXPLORE"}</Text>
      </View>
    </Pressable>
  );
}

/** Bleed past the gutter so the third card clips and the row reads as scrollable. */
export function CarouselRow({ children, testID }: { children: ReactNode; testID: string }) {
  return (
    <ScrollView
      testID={testID}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.carousel}
      contentContainerStyle={styles.carouselContent}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { width: 180, height: 120, borderRadius: tokens.radius.card, overflow: "hidden" },
  pressed: { opacity: 0.92 },
  copy: {
    position: "absolute",
    left: tokens.space.sm,
    right: tokens.space.sm,
    bottom: tokens.space.sm,
    gap: tokens.space.xxs,
  },
  title: { ...rn(tokens.type.titleSm), color: tokens.colors.textOnDark },
  price: { ...rn(tokens.type.factsMono), color: tokens.colors.textOnDarkMuted },
  carousel: { marginHorizontal: -tokens.space.lg },
  carouselContent: { paddingHorizontal: tokens.space.lg, gap: tokens.space.sm },
});
