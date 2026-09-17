import { StyleSheet, Text, View } from "react-native";
import type { z } from "zod";
import type { PricePair as PricePairSchema } from "@bbc/shared/api/v1/proposals";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Price = z.infer<typeof PricePairSchema>;

type Props = {
  price: Price;
  size?: "sm" | "lg";
  align?: "left" | "right";
};

const money = (n: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

/** Struck price always carries its source when one exists — FTC requirement. */
export function PricePair({ price, size = "sm", align = "right" }: Props) {
  const hasPublished = price.published != null;
  const label = hasPublished
    ? `${money(price.offer, price.currency)}, down from ${money(price.published!, price.currency)}`
    : money(price.offer, price.currency);

  return (
    <View style={[styles.wrap, align === "right" && styles.right]} accessibilityLabel={label}>
      {hasPublished ? (
        <>
          <Text style={styles.struck}>{money(price.published!, price.currency)}</Text>
          {price.publishedSource ? <Text style={styles.source}>{price.publishedSource.toUpperCase()}</Text> : null}
        </>
      ) : null}
      <Text style={size === "lg" ? styles.big : styles.price}>{money(price.offer, price.currency)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: tokens.space.xxs },
  right: { alignItems: "flex-end" },
  struck: {
    ...rn(tokens.type.priceStruck),
    color: tokens.colors.textTertiary,
    textDecorationLine: "line-through",
  },
  source: { ...rn(tokens.type.labelMono), color: tokens.colors.textSecondary },
  price: { ...rn(tokens.type.title), color: tokens.colors.textPrimary },
  big: { ...rn(tokens.type.price), color: tokens.colors.textPrimary },
});
