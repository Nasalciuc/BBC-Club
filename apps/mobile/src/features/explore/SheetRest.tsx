import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { AirportVM, HomeVM } from "@bbc/shared/api/v1/fares";
import type { ProposalCardVM } from "@bbc/shared/api/v1/proposals";
import { CarouselRow, OfferCard, SectionLabel, tokens } from "@bbc/ui";

import { NoOffers } from "@/features/explore/SheetExpanded";
import { cardPicture } from "@/features/places/place-photo-logic";
import { CLUB_PICTURE, PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";
import { fetchHome, fetchProfile } from "@/lib/api";
import { readFailureCopy, stateCopy } from "@/lib/error-context";
import { formatPrice } from "@/lib/format";

const JFK: AirportVM = {
  code: "JFK",
  city: "New York",
  name: "John F Kennedy International",
  countryCode: "US",
  lat: 40.6413,
  lng: -73.7781,
};

export function useExploreHome() {
  const [home, setHome] = useState<HomeVM | null>(null);
  const [homeEtag, setHomeEtag] = useState<string | null>(null);
  const [homeLoading, setHomeLoading] = useState(true);
  // The words of a failed load, never the network layer's own line (ADR-IMPL-047): offline says when it will load.
  const [homeError, setHomeError] = useState<{ title: string; body: string } | null>(null);
  const [defaultFrom, setDefaultFrom] = useState<AirportVM | null>(null);

  async function loadHome() {
    setHomeLoading(true);
    setHomeError(null);
    const result = await fetchHome(homeEtag);
    setHomeLoading(false);
    if (!result.ok) {
      setHomeError(readFailureCopy(result.code, "explore"));
      return;
    }
    if (!result.data.notModified) {
      setHome(result.data.home);
      setHomeEtag(result.data.etag);
    }
  }

  function retryHome() {
    void loadHome().catch(() => {
      setHomeLoading(false);
      setHomeError(stateCopy("route"));
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
  onOpenOffer: (card: ProposalCardVM) => void;
  /** Figma 89:386: `See all` beside OFFERS TO INSPIRE expands the sheet to every section (89:389). */
  onSeeAll: () => void;
  /** With no offer at all, the sheet offers the search instead of a heading over nothing (`NoOffers`). */
  onSearch: () => void;
};

export function SheetRest({ home, homeLoading, onOpenOffer, onSeeAll, onSearch }: Props) {
  const inspire = home?.sections.find((s) => s.key === "inspire")?.items ?? [];
  // ADR-IMPL-043: an offer without its own picture shows its city's photo; the club's image until there is one.
  const photoFor = usePlacePhotos(inspire.map((item) => item.route.to));

  if (homeLoading) {
    // The cards' places while Home loads: under the label's 32-pt box, two cards in the carousel's row.
    return (
      <View style={[styles.content, styles.skeletons]}>
        <View style={styles.skeletonCard} />
        <View style={styles.skeletonCard} />
      </View>
    );
  }

  if (home && inspire.length === 0) {
    return (
      <View style={styles.content}>
        <NoOffers onSearch={onSearch} />
      </View>
    );
  }

  return (
    <View style={styles.content}>
      <SectionLabel
        box
        label="Offers to inspire"
        action={{ label: "See all", onPress: onSeeAll, testID: "explore.seeAll" }}
      />
      <CarouselRow testID="explore.inspire">
        {inspire.map((item) => (
          <OfferCard
            key={item.id}
            testID={`explore.offer.${item.id}`}
            title={item.title}
            fromPrice={formatPrice(item.price.offer, item.price.currency)}
            image={cardPicture(item.mediaUrl, photoFor(item.route.to), PICTURE_HEADERS)}
            fallback={CLUB_PICTURE}
            onPress={() => onOpenOffer(item)}
          />
        ))}
      </CarouselRow>
    </View>
  );
}

const styles = StyleSheet.create({
  // Figma 89:386: 12 pt under the field, the label's 32-pt box, 12 pt, the 120-pt carousel.
  content: { marginTop: tokens.space.sm, gap: tokens.space.sm },
  skeletons: { flexDirection: "row", overflow: "hidden", paddingTop: 32 + tokens.space.sm },
  skeletonCard: {
    width: 180,
    height: 120,
    borderRadius: tokens.radius.card,
    backgroundColor: tokens.colors.borderDefault,
  },
});
