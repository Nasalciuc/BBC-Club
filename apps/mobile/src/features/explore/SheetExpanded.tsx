import { StyleSheet, View } from "react-native";
import type { HomeVM } from "@bbc/shared/api/v1/fares";
import type { ProposalCardVM } from "@bbc/shared/api/v1/proposals";
import { OfferCardWide, SectionHeader, TextButton, tokens } from "@bbc/ui";

import { cardPicture } from "@/features/places/place-photo-logic";
import { CLUB_PICTURE, PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";

import { offerCardModel } from "./offer-card-logic";
import { NoOffers, OfferCards } from "./SheetRest";

type Section = HomeVM["sections"][number];

type Props = {
  home: HomeVM | null;
  onOpenOffer: (card: ProposalCardVM) => void;
  /** `Done` lowers the sheet back to rest (02). */
  onDone: () => void;
  onSearch: () => void;
};

/**
 * Every offer (16): `Done` at the sheet's top, `Offers to inspire` and its row, then each region in the server's order
 * and words (`To Europe`, `To Asia`, `To the Middle East`) with its cards laid sideways — two to a row, one across the
 * row when it stands alone. Everything is on the page already, so no `See all` here.
 */
export function SheetExpanded({ home, onOpenOffer, onDone, onSearch }: Props) {
  const sections = home?.sections ?? [];
  const inspire = sections.find((s) => s.key === "inspire")?.items ?? [];
  const regions = sections.filter((s) => s.key !== "inspire" && s.items.length > 0);
  const photoFor = usePlacePhotos(regions.flatMap((s) => s.items.map((item) => item.route.to)));

  const region = (section: Section) => {
    const rows: ProposalCardVM[][] = [];
    for (let i = 0; i < section.items.length; i += 2) rows.push(section.items.slice(i, i + 2));
    return (
      <View key={section.key} style={styles.section} testID={`explore.section.${section.key}`}>
        <SectionHeader title={section.title} />
        {rows.map((row) => (
          <View key={row.map((item) => item.id).join(".")} style={styles.row}>
            {row.map((item) => {
              const model = offerCardModel(item, home?.destinations ?? []);
              return (
                <OfferCardWide
                  key={item.id}
                  testID={`explore.offer.${section.key}.${item.id}`}
                  span={row.length === 2 ? "half" : "full"}
                  city={model.city}
                  country={model.country}
                  fromPrice={model.fromPrice}
                  savePercent={model.savePercent}
                  image={cardPicture(item.mediaUrl, photoFor(item.route.to), PICTURE_HEADERS)}
                  fallback={CLUB_PICTURE}
                  onPress={() => onOpenOffer(item)}
                />
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  return (
    <View>
      <View style={styles.done}>
        <TextButton testID="explore.done" label="Done" size="button" onPress={onDone} />
      </View>
      {inspire.length === 0 && regions.length === 0 ? (
        <NoOffers onSearch={onSearch} />
      ) : (
        <View style={styles.content}>
          {inspire.length > 0 ? (
            <View style={styles.section}>
              <SectionHeader title="Offers to inspire" />
              <OfferCards
                items={inspire}
                home={home}
                onOpenOffer={onOpenOffer}
                testID="explore.inspire"
                cardTestID="explore.offer"
              />
            </View>
          ) : null}
          {regions.map(region)}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // 16: `Done` at the right, level with the grabber's band.
  done: { alignItems: "flex-end", height: 20, justifyContent: "center", marginBottom: tokens.space.xs },
  content: { gap: tokens.space.lg },
  section: { gap: tokens.space.sm },
  row: { flexDirection: "row", gap: tokens.space.sm },
});
