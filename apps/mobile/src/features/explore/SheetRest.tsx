import { StyleSheet, View } from "react-native";
import type { HomeVM } from "@bbc/shared/api/v1/fares";
import type { PlacePhotoVM } from "@bbc/shared/api/v1/places";
import type { ProposalCardVM } from "@bbc/shared/api/v1/proposals";
import {
  CAROUSEL_PAD,
  CarouselRow,
  EmptyState,
  OfferCard,
  SectionHeader,
  Skeleton,
  baselineOffset,
  belowBaseline,
  tokens,
  type PhotoSource,
} from "@bbc/ui";

import { clubPhoto } from "@/features/places/club-photos";
import { cardPicture } from "@/features/places/place-photo-logic";
import { CLUB_PICTURE, PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";

import { offerCardModel } from "./offer-card-logic";

/**
 * An offer's picture: the one its sender attached, else the design's photo of its city on an offer (02's Eiffel Tower,
 * Mount Fuji, Burj Khalifa — ADR-IMPL-056), else the city's place photo (ADR-IMPL-043); null — the club's image.
 */
export function offerPicture(item: ProposalCardVM, photo: PlacePhotoVM | undefined): PhotoSource | null {
  if (item.mediaUrl) return cardPicture(item.mediaUrl, photo, PICTURE_HEADERS);
  return clubPhoto(item.route.to, "offer") ?? cardPicture(undefined, photo, PICTURE_HEADERS);
}

/**
 * 02, in points under the sheet's content top (the search bar's top): the title's baseline 101.4 (5 pt further in
 * than the gutter, the action 13.7 from the screen's right); the cards' top 114.6, the first 11 from the screen's edge.
 */
const REST = {
  titleBaseline: 101.4,
  titleLeft: 5,
  actionRight: -1.3,
  cardsTop: 114.6,
  inset: 11,
  barHeight: 53.7,
  /** 17: no offer — the message's title 77.5 under the section's baseline. */
  emptyTitle: 77.5,
} as const;
const titleType = tokens.type.titleLg;

type Props = {
  home: HomeVM | null;
  homeLoading: boolean;
  onOpenOffer: (card: ProposalCardVM) => void;
  /** `See all ›` raises the sheet to every offer (16). */
  onSeeAll: () => void;
  /** With no offer at all, the sheet offers the search instead (17). */
  onSearch: () => void;
};

/** The club has no offer for the member yet (17): the search instead, its navy pill hugging its words. */
export function NoOffers({ onSearch, marginTop = 0 }: { onSearch: () => void; marginTop?: number }) {
  return (
    <View style={{ marginTop }}>
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
  look = "rest",
}: {
  items: readonly ProposalCardVM[];
  home: HomeVM | null;
  onOpenOffer: (card: ProposalCardVM) => void;
  testID: string;
  /** The cards' testID before each offer's id (`explore.offer`). */
  cardTestID: string;
  /** `Other great fares` (08): the smaller cards. */
  compact?: boolean;
  /** `rest` (02) or the raised sheet's shorter cards (`sheet`, 16). */
  look?: "rest" | "sheet";
}) {
  // ADR-IMPL-043: an offer without its own picture shows its city's photo; the club's image until there is one.
  const photoFor = usePlacePhotos(items.map((item) => item.route.to));
  return (
    <CarouselRow testID={testID} inset={compact ? tokens.space.sm : look === "sheet" ? 11.2 : REST.inset}>
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
            rating={model.rating}
            image={offerPicture(item, photoFor(item.route.to))}
            fallback={CLUB_PICTURE}
            onPress={() => onOpenOffer(item)}
            look={look}
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
    <View>
      <View style={styles.header}>
        <SectionHeader
          look="explore"
          title="Offers to inspire"
          // 17 keeps `See all ›` with no offer: it raises the sheet, which says so too.
          action={
            loading ? undefined : { label: "See all", chevron: true, onPress: onSeeAll, testID: "explore.seeAll" }
          }
        />
      </View>
      {loading ? (
        // The cards' places while Home loads: the cards' own size, so they land where the skeletons stood.
        <View style={styles.cards}>
          <CarouselRow testID="explore.inspire.loading" inset={REST.inset}>
            <Skeleton width={121.3} height={265} radius="md" />
            <Skeleton width={121.3} height={265} radius="md" />
            <Skeleton width={121.3} height={265} radius="md" />
          </CarouselRow>
        </View>
      ) : inspire.length === 0 ? (
        <NoOffers onSearch={onSearch} marginTop={REST.emptyTitle - belowBaseline(titleType)} />
      ) : (
        <View style={styles.cards}>
          <OfferCards
            items={inspire}
            home={home}
            onOpenOffer={onOpenOffer}
            testID="explore.inspire"
            cardTestID="explore.offer"
          />
        </View>
      )}
    </View>
  );
}

const titleTop = REST.titleBaseline - baselineOffset(titleType);
const styles = StyleSheet.create({
  header: { marginTop: titleTop - REST.barHeight, marginLeft: REST.titleLeft, marginRight: REST.actionRight },
  // The row keeps its own room above the cards for their shadow.
  cards: { marginTop: REST.cardsTop - CAROUSEL_PAD - (titleTop + titleType.lineHeight) },
});
