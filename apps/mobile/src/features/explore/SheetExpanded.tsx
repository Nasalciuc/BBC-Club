import { StyleSheet, View } from "react-native";
import type { HomeVM } from "@bbc/shared/api/v1/fares";
import type { ProposalCardVM } from "@bbc/shared/api/v1/proposals";
import { CarouselRow, OfferCard, SectionLabel, tokens } from "@bbc/ui";

import { cardPicture } from "@/features/places/place-photo-logic";
import { CLUB_PICTURE, PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";
import { formatPrice } from "@/lib/format";

type Section = HomeVM["sections"][number];

type Props = {
  sections: HomeVM["sections"];
  onOpenOffer: (card: ProposalCardVM) => void;
};

/**
 * Figma 89:389 (Expanded): `OFFERS TO INSPIRE` heads the page, then one carousel per region in the server's order and
 * words (`TO EUROPE`, `TO ASIA`, `TO THE MIDDLE EAST`, `TO NORTH AMERICA`), 32 pt apart. Without a region to show, the
 * inspiring offers stand under the heading, so the page is never a label alone.
 */
export function SheetExpanded({ sections, onOpenOffer }: Props) {
  const regions = sections.filter((s) => s.key !== "inspire" && s.items.length > 0);
  const inspire = sections.find((s) => s.key === "inspire");
  const shown = regions.length > 0 ? regions : inspire ? [inspire] : [];
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

  if (regions.length === 0) {
    return (
      <View style={[styles.content, styles.section]}>
        <SectionLabel box label="Offers to inspire" />
        {inspire ? carousel(inspire) : null}
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
