import { View } from "react-native";
import type { HomeVM } from "@bbc/shared/api/v1/fares";
import type { ProposalCardVM } from "@bbc/shared/api/v1/proposals";
import { CarouselRow, OfferCard, SectionLabel } from "@bbc/ui";

import { formatPrice } from "@/lib/format";

type Props = {
  sections: HomeVM["sections"];
  onOpenOffer: (card: ProposalCardVM) => void;
};

export function SheetExpanded({ sections, onOpenOffer }: Props) {
  const expanded = sections.filter((s) => s.key !== "inspire");

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
                imageUrl={item.mediaUrl ?? null}
                onPress={() => onOpenOffer(item)}
              />
            ))}
          </CarouselRow>
        </View>
      ))}
    </>
  );
}
