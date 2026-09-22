import { useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { AirportVM, HomeVM } from "@bbc/shared/api/v1/fares";
import { CarouselRow, OfferCard, SectionLabel, tokens } from "@bbc/ui";

import { fetchHome, fetchProfile } from "@/lib/api";

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

const JFK: AirportVM = {
  code: "JFK",
  city: "New York",
  name: "John F Kennedy International",
  countryCode: "US",
  lat: 40.6413,
  lng: -73.7781,
};

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

export function useExploreHome() {
  const [home, setHome] = useState<HomeVM | null>(null);
  const [homeEtag, setHomeEtag] = useState<string | null>(null);
  const [homeLoading, setHomeLoading] = useState(true);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [defaultFrom, setDefaultFrom] = useState<AirportVM | null>(null);

  async function loadHome() {
    setHomeLoading(true);
    setHomeError(null);
    const result = await fetchHome(homeEtag);
    setHomeLoading(false);
    if (!result.ok) {
      setHomeError(result.message);
      return;
    }
    if (!result.data.notModified) {
      setHome(result.data.home);
      setHomeEtag(result.data.etag);
    }
  }

  function retryHome() {
    void loadHome().catch((e) => {
      setHomeLoading(false);
      setHomeError(e instanceof Error ? e.message : "Something went wrong.");
    });
  }

  useEffect(() => {
    retryHome();
  }, []);

  useEffect(() => {
    void (async () => {
      const profile = await fetchProfile();
      if (profile.ok && profile.data.homeAirport && home) {
        const match = home.destinations.find((d) => d.code === profile.data.homeAirport);
        if (home.home) setDefaultFrom(home.home);
        else if (match) {
          setDefaultFrom({
            code: match.code,
            city: match.city,
            name: match.name,
            countryCode: match.countryCode,
            lat: match.lat,
            lng: match.lng,
          });
        }
      } else if (home?.home) {
        setDefaultFrom(home.home);
      } else {
        setDefaultFrom(JFK);
      }
    })();
  }, [home]);

  useEffect(() => {
    const t = setTimeout(() => {
      void (async () => {
        const profile = await fetchProfile();
        if (!profile.ok || !profile.data.homeAirport) return;
        const code = profile.data.homeAirport;
        if (home?.home?.code === code) {
          setDefaultFrom(home.home);
          return;
        }
        const match = home?.destinations.find((d) => d.code === code);
        if (match) {
          setDefaultFrom({
            code: match.code,
            city: match.city,
            name: match.name,
            countryCode: match.countryCode,
            lat: match.lat,
            lng: match.lng,
          });
        }
      })();
    }, 2000);
    return () => clearTimeout(t);
  }, [home]);

  return { home, homeLoading, homeError, defaultFrom, retryHome };
}

type Props = {
  home: HomeVM | null;
  homeLoading: boolean;
};

export function SheetRest({ home, homeLoading }: Props) {
  const router = useRouter();
  const inspire = asOffers(home?.sections.find((s) => s.key === "inspire")?.items ?? []);

  if (homeLoading) {
    return (
      <View style={styles.skeletons}>
        <View style={[styles.skeletonCard, { width: 180 }]} />
        <View style={[styles.skeletonCard, { width: 180 }]} />
      </View>
    );
  }

  return (
    <>
      <SectionLabel label="Offers to inspire" />
      <CarouselRow testID="explore.inspire">
        {inspire.map((item) => (
          <OfferCard
            key={item.id}
            testID={`explore.offer.${item.id}`}
            title={item.title}
            fromPrice={item.fromPrice}
            imageUrl={item.imageUrl}
            onPress={() => pushOffer(router, item.id)}
          />
        ))}
      </CarouselRow>
    </>
  );
}

const styles = StyleSheet.create({
  skeletons: { marginTop: tokens.space.md, gap: tokens.space.md },
  skeletonCard: {
    height: 120,
    borderRadius: tokens.radius.card,
    backgroundColor: tokens.colors.borderDefault,
    marginRight: tokens.space.sm,
  },
});
