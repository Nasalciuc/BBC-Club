import { StyleSheet, View } from "react-native";
import type { HomeVM, SiteDealVM } from "@bbc/shared/api/v1/fares";
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
import { cardPicture, remote } from "@/features/places/place-photo-logic";
import { CLUB_PICTURE, PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";

import { dealCardModel, homeDeals, offerCardModel } from "./offer-card-logic";

/**
 * An offer's picture: the one its sender attached, else the design's photo of its city on an offer (02's Eiffel Tower,
 * Mount Fuji, Burj Khalifa — ADR-IMPL-056), else the city's place photo (ADR-IMPL-043); null — the club's image.
 */
export function offerPicture(
  item: ProposalCardVM,
  photo: PlacePhotoVM | undefined,
  context: "offer" | "any" = "offer",
): PhotoSource | null {
  if (item.mediaUrl) return cardPicture(item.mediaUrl, photo, PICTURE_HEADERS);
  return clubPhoto(item.route.to, context) ?? cardPicture(undefined, photo, PICTURE_HEADERS);
}

/**
 * A site deal's picture (ADR-IMPL-067): the design's photo of its city on an offer, else the city's photo the deal
 * carries, else the one the place photos hold (ADR-IMPL-043); null — the club's image.
 */
export function dealPicture(deal: SiteDealVM, photo: PlacePhotoVM | undefined): PhotoSource | null {
  const own = deal.destination.photo;
  return (
    clubPhoto(deal.destination.code, "offer") ??
    (own ? remote(own.card, PICTURE_HEADERS) : cardPicture(undefined, photo, PICTURE_HEADERS))
  );
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
  /** A site deal opens its destination as a pin does (ADR-IMPL-067). */
  onOpenDeal: (deal: SiteDealVM) => void;
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

/**
 * 02: an offer card in an offers' row — the city and its country, the price, `Save 54%`, the city's photograph; after
 * the member's own offers, the company site's deals (ADR-IMPL-067): no `Save`, and `from New York` where a deal leaves
 * from another city.
 */
export function OfferCards({
  items,
  deals = [],
  home,
  onOpenOffer,
  onOpenDeal,
  testID,
  cardTestID,
  dealTestID = "explore.deal",
  compact = false,
  look = "rest",
  row,
}: {
  items: readonly ProposalCardVM[];
  /** The site's deals, after the offers. */
  deals?: readonly SiteDealVM[];
  home: HomeVM | null;
  onOpenOffer: (card: ProposalCardVM) => void;
  onOpenDeal?: (deal: SiteDealVM) => void;
  testID: string;
  /** The cards' testID before each offer's id (`explore.offer`). */
  cardTestID: string;
  /** The deals' testID before each deal's id (`explore.deal`). */
  dealTestID?: string;
  /** `Other great fares` (08): the smaller cards, each with its city's whole photograph (08 draws a landscape). */
  compact?: boolean;
  /** `rest` (02) or the raised sheet's shorter cards (`sheet`, 16). */
  look?: "rest" | "sheet";
  /** The row as its screen draws it: the page's side it runs under, the first card's inset, the space between. */
  row?: { bleed: number; inset: number; gap: number };
}) {
  // ADR-IMPL-043: an offer without its own picture shows its city's photo; the club's image until there is one. A deal
  // that carries its city's photo needs no question.
  const photoFor = usePlacePhotos([
    ...items.map((item) => item.route.to),
    ...deals.filter((deal) => !deal.destination.photo).map((deal) => deal.destination.code),
  ]);
  return (
    <CarouselRow
      testID={testID}
      bleed={row?.bleed}
      inset={row?.inset ?? (compact ? tokens.space.sm : look === "sheet" ? 11.2 : REST.inset)}
      gap={row?.gap}
    >
      {items.map((item) => {
        const model = offerCardModel(item, home?.destinations ?? [], home?.places ?? []);
        return (
          <OfferCard
            key={item.id}
            testID={`${cardTestID}.${item.id}`}
            city={model.city}
            country={model.country}
            fromPrice={model.fromPrice}
            savePercent={model.savePercent}
            rating={model.rating}
            image={offerPicture(item, photoFor(item.route.to), compact ? "any" : "offer")}
            fallback={CLUB_PICTURE}
            onPress={() => onOpenOffer(item)}
            look={look}
            compact={compact}
          />
        );
      })}
      {deals.map((deal) => {
        const model = dealCardModel(deal, home?.home ?? null);
        return (
          <OfferCard
            key={deal.id}
            testID={`${dealTestID}.${deal.id}`}
            city={model.city}
            country={model.country}
            fromPrice={model.fromPrice}
            savePercent={null}
            rating={null}
            origin={model.origin}
            image={dealPicture(deal, photoFor(deal.destination.code))}
            fallback={CLUB_PICTURE}
            onPress={() => onOpenDeal?.(deal)}
            look={look}
            compact={compact}
          />
        );
      })}
    </CarouselRow>
  );
}

/**
 * Explore at rest (02): `Offers to inspire` and its row of offer cards under the search bar — the member's own offers,
 * then the site's deals (ADR-IMPL-067); none of either — 17.
 */
export function SheetRest({ home, homeLoading, onOpenOffer, onOpenDeal, onSeeAll, onSearch }: Props) {
  const inspire = home?.sections.find((s) => s.key === "inspire")?.items ?? [];
  const deals = homeDeals(home);
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
      ) : inspire.length === 0 && deals.length === 0 ? (
        <NoOffers onSearch={onSearch} marginTop={REST.emptyTitle - belowBaseline(titleType)} />
      ) : (
        <View style={styles.cards}>
          <OfferCards
            items={inspire}
            deals={deals}
            home={home}
            onOpenOffer={onOpenOffer}
            onOpenDeal={onOpenDeal}
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
