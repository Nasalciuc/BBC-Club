import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ProposalCardVM } from "@bbc/shared/api/v1/proposals";

import { Club } from "@/constants/club";
import { formatPrice, formatValidUntil, routeLine } from "@/lib/format";

type Props = {
  card: ProposalCardVM;
  onPress: () => void;
  testID?: string;
};

export function ProposalCard({ card, onPress, testID }: Props) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={card.title}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.media}>
        {card.mediaUrl ? (
          <Image
            source={{ uri: card.mediaUrl }}
            style={styles.image}
            contentFit="cover"
            placeholder={card.mediaBlurhash ? { blurhash: card.mediaBlurhash } : undefined}
          />
        ) : (
          <View style={styles.placeholder} />
        )}
        {card.targeting === "personal" ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>FOR YOU</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {card.title}
        </Text>
        {card.contextLine ? (
          <Text style={styles.context} numberOfLines={2}>
            {card.contextLine}
          </Text>
        ) : null}
        <Text style={styles.facts}>{routeLine(card)}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatPrice(card.price.offer, card.price.currency)}</Text>
          {card.price.published != null ? (
            <Text style={styles.published}>{formatPrice(card.price.published, card.price.currency)}</Text>
          ) : null}
        </View>
        <Text style={styles.valid}>{formatValidUntil(card.validUntil)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Club.colors.surfaceCard,
    borderRadius: Club.radius.card,
    borderWidth: 1,
    borderColor: Club.colors.borderDefault,
    overflow: "hidden",
    marginBottom: Club.space.lg,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  media: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: Club.colors.surfaceMuted,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  placeholder: {
    flex: 1,
    backgroundColor: Club.colors.surfaceMuted,
  },
  badge: {
    position: "absolute",
    top: Club.space.sm,
    left: Club.space.sm,
    backgroundColor: Club.colors.primary,
    borderRadius: Club.radius.badge,
    paddingHorizontal: Club.space.xs,
    paddingVertical: Club.space.xxs,
  },
  badgeText: {
    ...Club.type.labelMono,
    color: Club.colors.textOnDark,
    textTransform: "uppercase",
  },
  body: {
    padding: Club.space.md,
    gap: Club.space.xxs,
  },
  title: {
    ...Club.type.title,
    color: Club.colors.textPrimary,
  },
  context: {
    ...Club.type.bodySm,
    color: Club.colors.textSecondary,
  },
  facts: {
    ...Club.type.factsMono,
    color: Club.colors.textSecondary,
    textTransform: "uppercase",
    marginTop: Club.space.xxs,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: Club.space.xs,
    marginTop: Club.space.xs,
  },
  price: {
    ...Club.type.titleSm,
    color: Club.colors.textPrimary,
  },
  published: {
    ...Club.type.caption,
    color: Club.colors.textTertiary,
    textDecorationLine: "line-through",
  },
  valid: {
    ...Club.type.caption,
    color: Club.colors.textTertiary,
    marginTop: Club.space.xxs,
  },
});
