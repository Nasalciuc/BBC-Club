import { useRouter, type Href } from "expo-router";
import { View } from "react-native";
import type { HomeVM } from "@bbc/shared/api/v1/fares";
import { CarouselRow, OfferCard, SectionLabel } from "@bbc/ui";

type OfferItem = { id: string; title: string; fromPrice?: string | null; imageUrl: string | null };

function asOffers(items: unknown[]): OfferItem[] {
  return items.map((raw, i) => {
    const o = raw as Partial<OfferItem>;
    return {
      id: typeof o.id === "string" ? o.id : `offer-${i}`,
      title: typeof o.title === "string" ? o.title : "Offer",
      fromPrice: typeof o.fromPrice === "string" ? o.fromPrice : null,
      imageUrl: typeof o.imageUrl === "string" ? o.imageUrl : null,
    };
  });
}

function pushOffer(router: ReturnType<typeof useRouter>, offerId: string) {
  const fareByOffer: Record<string, string> = {
    london: "00000000-0000-4000-8000-00000000fa01",
    paris: "00000000-0000-4000-8000-00000000fa03",
    tokyo: "00000000-0000-4000-8000-00000000fa04",
  };
  const fareId = fareByOffer[offerId];
  if (!fareId) return;
  router.push({
    pathname: "/fare/[id]",
    params: { id: fareId, offerId },
  } as unknown as Href);
}

type Props = {
  sections: HomeVM["sections"];
};

export function SheetExpanded({ sections }: Props) {
  const router = useRouter();
  const expanded = sections.filter((s) => s.key !== "inspire");

  return (
    <>
      {expanded.map((section) => (
        <View key={section.key}>
          <SectionLabel label={section.title} />
          <CarouselRow testID={`explore.section.${section.key}`}>
            {asOffers(section.items).map((item) => (
              <OfferCard
                key={`${section.key}-${item.id}`}
                testID={`explore.offer.${section.key}.${item.id}`}
                title={item.title}
                fromPrice={item.fromPrice}
                imageUrl={item.imageUrl}
                onPress={() => pushOffer(router, item.id)}
              />
            ))}
          </CarouselRow>
        </View>
      ))}
    </>
  );
}
