import { StyleSheet, View } from "react-native";
import type { HomeVM } from "@bbc/shared/api/v1/fares";
import type { ProposalCardVM } from "@bbc/shared/api/v1/proposals";
import { CarouselRow, EmptyState, OfferCard, SectionHeader, Skeleton, tokens } from "@bbc/ui";

import { cardPicture } from "@/features/places/place-photo-logic";
import { CLUB_PICTURE, PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";

import { offerCardModel } from "./offer-card-logic";

type Props = {
  home: HomeVM | null;
  homeLoading: boolean;
  onOpenOffer: (card: ProposalCardVM) => void;
  /** `See all ›` raises the sheet to every offer (16). */
  onSeeAll: () => void;
  /** With no offer at all, the sheet offers the search instead (17). */
  onSearch: () => void;
};

/** The club has no offer for the member yet (17): the search instead, its pill hugging its words. */
export function NoOffers({ onSearch }: { onSearch: () => void }) {
  return (
    <View style={styles.empty}>
      <EmptyState
        testID="explore.offers.empty"
        look="explore"
        title="No offers yet."
        body="Your specialist’s offers will appear here. Search a destination to request a fare."
        primary={{ label: "Search a destination", onPress: onSearch }}
        primaryFill={false}
      />
    </View>
  );
}

/** 02: an offer card in an offers' row — the city and its country, the price, `Save 54%`, the city's photograph. */
export function OfferCards({
  items,
  home,
  onOpenOffer,
  testID,
  cardTestID,
  compact = false,
}: {
  items: readonly ProposalCardVM[];
  home: HomeVM | null;
  onOpenOffer: (card: ProposalCardVM) => void;
  testID: string;
  /** The cards' testID before each offer's id (`explore.offer`). */
  cardTestID: string;
  /** `Other great fares` (08): the smaller cards. */
  compact?: boolean;
}) {
  // ADR-IMPL-043: an offer without its own picture shows its city's photo; the club's image until there is one.
  const photoFor = usePlacePhotos(items.map((item) => item.route.to));
  return (
    <CarouselRow testID={testID}>
      {items.map((item) => {
        const model = offerCardModel(item, home?.destinations ?? []);
        return (
          <OfferCard
            key={item.id}
            testID={`${cardTestID}.${item.id}`}
            city={model.city}
            country={model.country}
            fromPrice={model.fromPrice}
            savePercent={model.savePercent}
            image={cardPicture(item.mediaUrl, photoFor(item.route.to), PICTURE_HEADERS)}
            fallback={CLUB_PICTURE}
            onPress={() => onOpenOffer(item)}
            compact={compact}
          />
        );
      })}
    </CarouselRow>
  );
}

/** Explore at rest (02): `Offers to inspire` and its row of offer cards under the search bar; none — 17. */
export function SheetRest({ home, homeLoading, onOpenOffer, onSeeAll, onSearch }: Props) {
  const inspire = home?.sections.find((s) => s.key === "inspire")?.items ?? [];
  const loading = homeLoading && !home;
  return (
    <View style={styles.content}>
      <SectionHeader
        title="Offers to inspire"
        action={
          inspire.length > 0
            ? { label: "See all", chevron: true, onPress: onSeeAll, testID: "explore.seeAll" }
            : undefined
        }
      />
      {loading ? (
        // The cards' places while Home loads: the cards' own size, so they land where the skeletons stood.
        <CarouselRow testID="explore.inspire.loading">
          <Skeleton width={124} height={264} radius="lg" />
          <Skeleton width={124} height={264} radius="lg" />
          <Skeleton width={124} height={264} radius="lg" />
        </CarouselRow>
      ) : inspire.length === 0 ? (
        <NoOffers onSearch={onSearch} />
      ) : (
        <OfferCards
          items={inspire}
          home={home}
          onOpenOffer={onOpenOffer}
          testID="explore.inspire"
          cardTestID="explore.offer"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // 02: the title 20 pt under the search bar; the carousel's own 12-pt padding sets the cards under it.
  content: { marginTop: tokens.space.gutter },
  // 17: the message 40 pt under the title.
  empty: { marginTop: tokens.space.xxl - tokens.space.sm },
});
