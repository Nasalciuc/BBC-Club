import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { z } from "zod";
import type { FareVM } from "@bbc/shared/api/v1/fares";
import { PricePair } from "../primitives/PricePair";
import { rn } from "../rn-type";
import { tokens } from "../tokens";
import { fareFacts } from "./fare-facts";

type Fare = z.infer<typeof FareVM>;
type Props = { fare: Fare; onPress: () => void; testID: string };

/** Two renders on departLocal. No chevron — the price is the affordance. */
export function FareRow({ fare, onPress, testID }: Props) {
  const timed = fare.departLocal != null && fare.arriveLocal != null;
  const facts = fareFacts(fare);

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${fare.carrier.name}, ${timed ? facts : "times on request"}, ${fare.product ?? ""}`}
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
        <PricePair price={fare.price} size="sm" color={fare.hasOffer ? tokens.colors.accentWarm : undefined} />
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

const styles = StyleSheet.create({
  row: {
    height: 80,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.card,
    paddingHorizontal: tokens.space.md,
    marginBottom: tokens.space.md,
  },
  pressed: { opacity: 0.9 },
  logo: {
    width: 20,
    height: 20,
    borderRadius: tokens.radius.badge,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  logoImage: { width: 18, height: 18, resizeMode: "contain" },
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
