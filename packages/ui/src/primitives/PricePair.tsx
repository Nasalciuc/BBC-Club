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
  /** Offer amount only. Caller passes a token — never a hex. */
  color?: string;
  /** Fare pages use the editorial pair, a request's detail Figma's Detail pair (26:29). Cards stay stacked. */
  layout?: "stack" | "editorial" | "detail";
};

const money = (n: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

/** Struck price always carries its source when one exists — FTC requirement. */
export function PricePair({ price, size = "sm", align = "right", color, layout = "stack" }: Props) {
  const hasPublished = price.published != null;
  const label = hasPublished
    ? `${money(price.offer, price.currency)}, down from ${money(price.published!, price.currency)}`
    : money(price.offer, price.currency);

  if (layout === "detail") {
    // Figma 26:29: YOUR FARE over the fare, the published fare struck beside it with its source below. One element for a
    // screen reader, which hears the struck fare as a fare it is down from, not as a second price.
    return (
      <View style={styles.detail} accessible accessibilityLabel={`Your fare ${label}`}>
        <View style={[styles.detailColumn, styles.detailOffer]}>
          <Text style={styles.source}>YOUR FARE</Text>
          <Text style={[styles.big, color ? { color } : null]}>{money(price.offer, price.currency)}</Text>
        </View>
        {hasPublished ? (
          <View style={styles.detailColumn}>
            <Text style={styles.struck}>{money(price.published!, price.currency)}</Text>
            {price.publishedSource ? <Text style={styles.source}>{price.publishedSource.toUpperCase()}</Text> : null}
          </View>
        ) : null}
      </View>
    );
  }

  if (layout === "editorial") {
    // One element for a screen reader, as the detail pair: `Your fare $3,900, down from $7,550`.
    return (
      <View style={styles.editorial} accessible accessibilityLabel={`Your fare ${label}`}>
        <View style={styles.editorialOffer}>
          <Text style={styles.yourFare}>Your fare</Text>
          <Text style={[styles.displayPrice, color ? { color } : null]}>{money(price.offer, price.currency)}</Text>
        </View>
        {hasPublished ? (
          <View style={styles.editorialPublished}>
            <Text style={styles.struck}>{money(price.published!, price.currency)}</Text>
            {price.publishedSource ? <Text style={styles.source}>{price.publishedSource.toUpperCase()}</Text> : null}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.wrap, align === "right" && styles.right]} accessibilityLabel={label}>
      {hasPublished ? (
        <>
          <Text style={styles.struck}>{money(price.published!, price.currency)}</Text>
          {price.publishedSource ? <Text style={styles.source}>{price.publishedSource.toUpperCase()}</Text> : null}
        </>
      ) : null}
      <Text style={[size === "lg" ? styles.big : styles.price, color ? { color } : null]}>
        {money(price.offer, price.currency)}
      </Text>
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
  detail: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: tokens.space.lg },
  detailColumn: { gap: tokens.space.xs },
  // Figma 26:30: the fare's column is 144 pt, so a published fare starts where the frame draws it; a minimum, not a
  // width, so the pair still wraps at larger text (DESIGN.md: it wraps before it shrinks).
  detailOffer: { minWidth: 144 },
  editorial: { flexDirection: "row", alignItems: "flex-end", gap: tokens.space.lg },
  editorialOffer: { flex: 1, gap: tokens.space.xxs },
  editorialPublished: { flex: 1, gap: tokens.space.xxs },
  yourFare: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary },
  displayPrice: { ...rn(tokens.type.display), color: tokens.colors.textPrimary },
});
