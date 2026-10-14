import { StyleSheet, View } from "react-native";
import type { HomeVM } from "@bbc/shared/api/v1/fares";
import type { ProposalCardVM } from "@bbc/shared/api/v1/proposals";
import { CarouselRow, EmptyState, OfferCard, SectionLabel, tokens } from "@bbc/ui";

import { cardPicture } from "@/features/places/place-photo-logic";
import { CLUB_PICTURE, PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";
import { formatPrice } from "@/lib/format";

type Section = HomeVM["sections"][number];

type Props = {
  sections: HomeVM["sections"];
  onOpenOffer: (card: ProposalCardVM) => void;
  /** With no offer at all, the page offers the search instead (`NoOffers`). */
  onSearch: () => void;
};

/** The club has no offer for the member yet — Figma draws none of this page without cards, so the page says so. */
export function NoOffers({ onSearch }: { onSearch: () => void }) {
  return (
    <EmptyState
      testID="explore.offers.empty"
      title="No offers yet."
      body="Your specialist’s offers will appear here. Search a destination to request a fare."
      primary={{ label: "Search a destination", onPress: onSearch }}
    />
  );
}

/**
 * Figma 89:389 (Expanded): `OFFERS TO INSPIRE` heads the page, then one carousel per region in the server's order and
 * words (`TO EUROPE`, `TO ASIA`, `TO THE MIDDLE EAST`, `TO NORTH AMERICA`), 32 pt apart. Without a region to show, the
 * inspiring offers stand under the heading, so the page is never a label alone — and without an offer at all, the
 * page says so instead of a heading over nothing.
 */
export function SheetExpanded({ sections, onOpenOffer, onSearch }: Props) {
  const regions = sections.filter((s) => s.key !== "inspire" && s.items.length > 0);
  const inspire = sections.find((s) => s.key === "inspire");
  const shown = regions.length > 0 ? regions : inspire && inspire.items.length > 0 ? [inspire] : [];
  const photoFor = usePlacePhotos(shown.flatMap((s) => s.items.map((item) => item.route.to)));

  const carousel = (section: Section) => (
    <CarouselRow testID={`explore.section.${section.key}`}>
      {section.items.map((item) => (
        <OfferCard
          key={`${section.key}-${item.id}`}
          testID={`explore.offer.${section.key}.${item.id}`}
          title={item.title}
          fromPrice={formatPrice(item.price.offer, item.price.currency)}
          image={cardPicture(item.mediaUrl, photoFor(item.route.to), PICTURE_HEADERS)}
          fallback={CLUB_PICTURE}
          onPress={() => onOpenOffer(item)}
        />
      ))}
    </CarouselRow>
  );

  if (shown.length === 0) {
    return (
      <View style={styles.content}>
        <NoOffers onSearch={onSearch} />
      </View>
    );
  }

  if (regions.length === 0) {
    return (
      <View style={[styles.content, styles.section]}>
        <SectionLabel box label="Offers to inspire" />
        {carousel(shown[0]!)}
      </View>
    );
  }

  return (
    <View style={styles.content}>
      <SectionLabel box label="Offers to inspire" />
      {regions.map((section) => (
        <View key={section.key} style={styles.section}>
          <SectionLabel box label={section.title} />
          {carousel(section)}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // 12 pt under the field; the heading and the regions 32 pt apart; in a region, its label's box 12 pt over the cards.
  content: { marginTop: tokens.space.sm, gap: tokens.space.xl },
  section: { gap: tokens.space.sm },
});
