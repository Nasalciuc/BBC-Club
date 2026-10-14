import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { z } from "zod";
import type { FareVM } from "@bbc/shared/api/v1/fares";
import { PricePair } from "../primitives/PricePair";
import { rn } from "../rn-type";
import { tokens } from "../tokens";
import { fareFacts } from "./fare-facts";

type Fare = z.infer<typeof FareVM>;
type Props = { fare: Fare; onPress: () => void; testID: string };

/**
 * Figma FareRow (32:2) as 89:387 draws it: the airline's monogram, name, facts and cabin; the price alone at the right, in
 * `price`. The published fare and its source (FTC) are on the fare's page, where there is room for both and for "Why it's
 * $X lower" — never a struck price squeezed into the row. The facts are the stops and the time in the air; the clocks are
 * the fare page's. No chevron — the price is the affordance.
 */
export function FareRow({ fare, onPress, testID }: Props) {
  const facts = fareFacts(fare);
  const price = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: fare.price.currency,
    maximumFractionDigits: 0,
  }).format(fare.price.offer);
  // The row is one element for a screen reader: what is drawn, the price included.
  const label = [fare.carrier.name, facts, fare.product, price].filter(Boolean).join(", ");

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <CarrierLogo code={fare.carrier.code} url={fare.carrier.logoUrl} />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {fare.carrier.name}
        </Text>
        <Text style={styles.facts} numberOfLines={1}>
          {facts}
        </Text>
        {fare.product ? (
          <Text style={styles.product} numberOfLines={1}>
            {fare.product}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>
        {fare.hasOffer ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>OFFER</Text>
          </View>
        ) : null}
        <PricePair
          price={{ offer: fare.price.offer, currency: fare.price.currency }}
          size="lg"
          color={fare.hasOffer ? tokens.colors.accentWarm : undefined}
        />
      </View>
    </Pressable>
  );
}

function CarrierLogo({ code, url }: { code: string | null; url: string | null }) {
  return (
    <View style={styles.logo}>
      {url ? (
        <Image source={{ uri: url }} style={styles.logoImage} accessibilityIgnoresInvertColors />
      ) : (
        <Text style={styles.logoCode}>{code ?? "··"}</Text>
      )}
    </View>
  );
}

/** Figma 89:387: an 88 pt row, 12 pt inside, 8 pt between rows; a minimum, so larger text grows the row, never clips it. */
export const FARE_ROW_HEIGHT = 88;

const styles = StyleSheet.create({
  row: {
    minHeight: FARE_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.card,
    padding: tokens.space.sm,
    marginBottom: tokens.space.xs,
  },
  pressed: { opacity: 0.9 },
  // Figma "Airline monogram": 32 pt, the page's grey, badge corners, no border.
  logo: {
    width: 32,
    height: 32,
    borderRadius: tokens.radius.badge,
    backgroundColor: tokens.colors.surfacePage,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoImage: { width: 24, height: 24, resizeMode: "contain" },
  logoCode: { ...rn(tokens.type.labelMono), color: tokens.colors.textPrimary },
  body: { flex: 1, gap: tokens.space.xxs },
  name: { ...rn(tokens.type.titleSm), color: tokens.colors.textPrimary },
  facts: { ...rn(tokens.type.factsMono), color: tokens.colors.textSecondary },
  product: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary },
  right: { alignItems: "flex-end", gap: tokens.space.xxs },
  badge: {
    backgroundColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.badge,
    paddingHorizontal: tokens.space.xs,
    paddingVertical: 2,
  },
  badgeText: { ...rn(tokens.type.labelMono), color: tokens.colors.primary },
});
