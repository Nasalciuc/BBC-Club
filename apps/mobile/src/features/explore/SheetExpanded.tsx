import { View } from "react-native";
import type { HomeVM } from "@bbc/shared/api/v1/fares";
import type { ProposalCardVM } from "@bbc/shared/api/v1/proposals";
import { CarouselRow, OfferCard, SectionLabel } from "@bbc/ui";

import { cardPicture } from "@/features/places/place-photo-logic";
import { CLUB_PICTURE, PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";
import { formatPrice } from "@/lib/format";

type Props = {
  sections: HomeVM["sections"];
  onOpenOffer: (card: ProposalCardVM) => void;
};

export function SheetExpanded({ sections, onOpenOffer }: Props) {
  const expanded = sections.filter((s) => s.key !== "inspire");
  const photoFor = usePlacePhotos(expanded.flatMap((s) => s.items.map((item) => item.route.to)));

  return (
    <>
      {expanded.map((section) => (
        <View key={section.key}>
          <SectionLabel label={section.title} />
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
        </View>
      ))}
    </>
  );
}
