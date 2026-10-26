import { StyleSheet, Text, View } from "react-native";
import type { HomeVM, SiteDealVM } from "@bbc/shared/api/v1/fares";
import type { ProposalCardVM } from "@bbc/shared/api/v1/proposals";
import {
  CAROUSEL_PAD,
  CarouselRow,
  HOME_SHEET_HANDLE,
  OfferCardWide,
  Skeleton,
  TextButton,
  baselineOffset,
  rn,
  tokens,
} from "@bbc/ui";

import { CLUB_PICTURE, usePlacePhotos } from "@/features/places/usePlacePhotos";

import { homeDeals, offerCardModel, sheetExpandedState } from "./offer-card-logic";
import { NoOffers, OfferCards, offerPicture } from "./SheetRest";

type Section = HomeVM["sections"][number];

type Props = {
  home: HomeVM | null;
  /** Home is on its way: the cards' places, never `No offers yet.` before it answered (ADR-IMPL-047). */
  homeLoading: boolean;
  onOpenOffer: (card: ProposalCardVM) => void;
  /** A site deal opens its destination as a pin does (ADR-IMPL-067). */
  onOpenDeal: (deal: SiteDealVM) => void;
  onSearch: () => void;
};

/**
 * 16, in points under the sheet's content (16 under its top edge): `Done`'s baseline 8.5, 17.2 from the screen's right;
 * `Offers to inspire` 18.6 in on 43.8 and its cards from 55.5 (11.2 from the screen's edge, 222.4 tall); each region's
 * title 18 in, its baseline 29.3 under the cards before it, its cards 10.6 under that — 12 from the screen's left and
 * 11.25 from its right, 8 apart.
 */
const ALL = {
  doneBaseline: 8.5,
  doneRight: 17.2,
  titleBaseline: 43.8,
  inspireLeft: 18.6,
  inspireTop: 55.5,
  inspireHeight: 222.4,
  regionLeft: 18,
  titleAfterCards: 29.3,
  cardsAfterTitle: 10.6,
  cardsLeft: 12,
  cardsRight: 11.25,
  rowGap: 8,
  halfHeight: 96.7,
  fullHeight: 74.8,
  /** The inspire row's first card from the screen's edge, and its cards' width (OfferCard `look="sheet"`). */
  sheetCardsInset: 11.2,
  sheetCard: { width: 121.4 },
} as const;
/** With no offer at all, the message's title 77.5 under the content's top, as 17 sets it under its section. */
const NO_OFFERS_TOP = 77.5;
const doneType = tokens.type.sheetDone;
const titleType = tokens.type.sheetTitle;
const gutter = tokens.space.gutter;

type PlacedRegion = { section: Section; rows: ProposalCardVM[][]; marginTop: number; cardsMargin: number };

/** Each region's rows and where its title and cards stand: a title is measured from the cards before it (16). */
function placeRegions(regions: readonly Section[], afterInspire: boolean): PlacedRegion[] {
  let bottom = afterInspire ? ALL.inspireTop + ALL.inspireHeight : 0;
  // After the carousel, its own room under the cards (for their shadow) is already laid out.
  let pad = afterInspire ? CAROUSEL_PAD : 0;
  const out: PlacedRegion[] = [];
  for (const section of regions) {
    const rows: ProposalCardVM[][] = [];
    for (let i = 0; i < section.items.length; i += 2) rows.push(section.items.slice(i, i + 2));
    const baseline = bottom + ALL.titleAfterCards;
    const titleTop = baseline - baselineOffset(titleType);
    const cardsTop = baseline + ALL.cardsAfterTitle;
    out.push({
      section,
      rows,
      marginTop: titleTop - bottom - pad,
      cardsMargin: cardsTop - (titleTop + titleType.lineHeight),
    });
    pad = 0;
    bottom =
      cardsTop +
      rows.reduce(
        (h, row, i) => h + (row.length === 2 ? ALL.halfHeight : ALL.fullHeight) + (i > 0 ? ALL.rowGap : 0),
        0,
      );
  }
  return out;
}

/**
 * Every offer (16): `Done` at the sheet's top, `Offers to inspire` and its row of shorter cards (the member's own
 * offers, then the site's deals — ADR-IMPL-067), then each region in
 * the server's order and words (`To Europe`, `To Asia`, `To the Middle East`) with its cards laid sideways — two to a
 * row, one across the row when it stands alone. Everything is on the page already, so no `See all` here.
 */
export function SheetExpanded({ home, homeLoading, onOpenOffer, onOpenDeal, onSearch }: Props) {
  const shown = sheetExpandedState(home, homeLoading);
  const sections = home?.sections ?? [];
  const inspire = sections.find((s) => s.key === "inspire")?.items ?? [];
  // ADR-IMPL-067: the site's deals close the inspiring row, after the member's own offers; the regions stay offers.
  const deals = homeDeals(home);
  const inspireShown = inspire.length > 0 || deals.length > 0;
  const regions = sections.filter((s) => s.key !== "inspire" && s.items.length > 0);
  const photoFor = usePlacePhotos(regions.flatMap((s) => s.items.map((item) => item.route.to)));

  const placed = placeRegions(regions, inspireShown);

  const region = ({ section, rows, marginTop, cardsMargin }: PlacedRegion) => {
    return (
      <View key={section.key} testID={`explore.section.${section.key}`}>
        <Text style={[styles.title, { marginTop, marginLeft: ALL.regionLeft - gutter }]} accessibilityRole="header">
          {section.title}
        </Text>
        <View style={[styles.rows, { marginTop: cardsMargin }]}>
          {rows.map((row) => (
            <View key={row.map((item) => item.id).join(".")} style={styles.row}>
              {row.map((item) => {
                const model = offerCardModel(item, home?.destinations ?? [], home?.places ?? []);
                return (
                  <OfferCardWide
                    key={item.id}
                    testID={`explore.offer.${section.key}.${item.id}`}
                    span={row.length === 2 ? "half" : "full"}
                    city={model.city}
                    country={model.country}
                    fromPrice={model.fromPrice}
                    savePercent={model.savePercent}
                    rating={model.rating}
                    image={offerPicture(item, photoFor(item.route.to))}
                    fallback={CLUB_PICTURE}
                    onPress={() => onOpenOffer(item)}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </View>
    );
  };

  const inspireTitleTop = ALL.titleBaseline - baselineOffset(titleType);

  if (shown === "loading") {
    // Home on its way: `Offers to inspire` and its cards' places, as Explore at rest keeps them (SheetRest).
    return (
      <View>
        <Text
          style={[styles.title, { marginTop: inspireTitleTop, marginLeft: ALL.inspireLeft - gutter }]}
          accessibilityRole="header"
        >
          Offers to inspire
        </Text>
        <View style={{ marginTop: ALL.inspireTop - CAROUSEL_PAD - (inspireTitleTop + titleType.lineHeight) }}>
          <CarouselRow testID="explore.inspire.loading" inset={ALL.sheetCardsInset}>
            <Skeleton width={ALL.sheetCard.width} height={ALL.inspireHeight} radius="md" />
            <Skeleton width={ALL.sheetCard.width} height={ALL.inspireHeight} radius="md" />
            <Skeleton width={ALL.sheetCard.width} height={ALL.inspireHeight} radius="md" />
          </CarouselRow>
        </View>
      </View>
    );
  }

  return (
    <View>
      {shown === "empty" ? (
        // No offer at all: the message 77.5 under the sheet's content top, as 17 sets it under its title.
        <NoOffers onSearch={onSearch} marginTop={NO_OFFERS_TOP} />
      ) : (
        <View>
          {inspireShown ? (
            <View>
              <Text
                style={[styles.title, { marginTop: inspireTitleTop, marginLeft: ALL.inspireLeft - gutter }]}
                accessibilityRole="header"
              >
                Offers to inspire
              </Text>
              <View style={{ marginTop: ALL.inspireTop - CAROUSEL_PAD - (inspireTitleTop + titleType.lineHeight) }}>
                <OfferCards
                  items={inspire}
                  deals={deals}
                  home={home}
                  onOpenOffer={onOpenOffer}
                  onOpenDeal={onOpenDeal}
                  testID="explore.inspire"
                  cardTestID="explore.offer"
                  look="sheet"
                />
              </View>
            </View>
          ) : null}
          {placed.map(region)}
        </View>
      )}
    </View>
  );
}

/**
 * 16's `Done`, in the sheet's grabber band (its words stand partly above where the content starts): its baseline 24.5
 * under the sheet's top, 17.2 from the screen's right. It lowers the sheet back to rest (02).
 */
export function SheetDone({ onDone }: { onDone: () => void }) {
  return (
    <View style={styles.done}>
      <TextButton testID="explore.done" label="Done" text="sheetDone" onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  done: {
    position: "absolute",
    right: ALL.doneRight,
    top: HOME_SHEET_HANDLE + ALL.doneBaseline - baselineOffset(doneType),
  },
  title: { ...rn(titleType), color: tokens.colors.textPrimary },
  rows: { gap: ALL.rowGap, marginLeft: ALL.cardsLeft - gutter, marginRight: ALL.cardsRight - gutter },
  row: { flexDirection: "row", gap: ALL.rowGap },
});
