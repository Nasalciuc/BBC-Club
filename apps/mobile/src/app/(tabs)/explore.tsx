import NetInfo from "@react-native-community/netinfo";
import { useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AirportVM, HomeVM } from "@bbc/shared/api/v1/fares";
import {
  AirportRow,
  CarouselRow,
  Chip,
  EmptyState,
  ErrorState,
  FareRow,
  GlobeFallback,
  HomeSheet,
  OfferCard,
  SearchField,
  SectionLabel,
  tokens,
  rn,
} from "@bbc/ui";

import { useDestinations } from "@/features/globe/useDestinations";
import { useSearch } from "@/features/search/useSearch";
import { fetchAirports, fetchHome, fetchProfile } from "@/lib/api";

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

function fareHref(id: string): Href {
  return { pathname: "/fare/[id]", params: { id } } as unknown as Href;
}

export default function ExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [home, setHome] = useState<HomeVM | null>(null);
  const [homeEtag, setHomeEtag] = useState<string | null>(null);
  const [homeLoading, setHomeLoading] = useState(true);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [offline, setOffline] = useState(false);
  const [defaultFrom, setDefaultFrom] = useState<AirportVM | null>(null);
  const [airportQuery, setAirportQuery] = useState("");
  const [airportHits, setAirportHits] = useState<AirportVM[]>([]);
  const [pickingAirport, setPickingAirport] = useState(false);

  const { state, dispatch } = useSearch({ defaultFrom });
  const { pins, homeCoord, pinToAirport } = useDestinations(home, state.to?.code ?? null);

  useEffect(() => {
    const sub = NetInfo.addEventListener((s) => {
      setOffline(!(s.isConnected && s.isInternetReachable !== false));
    });
    return () => sub();
  }, []);

  useEffect(() => {
    void (async () => {
      const profile = await fetchProfile();
      if (profile.ok && profile.data.homeAirport && home) {
        const match = home.destinations.find((d) => d.code === profile.data.homeAirport);
        const airport = home.home;
        if (airport) setDefaultFrom(airport);
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
      }
    })();
  }, [home]);

  useEffect(() => {
    void loadHome();
  }, []);

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

  useEffect(() => {
    if (state.to && sheetIndex < 1) setSheetIndex(1);
  }, [state.to, sheetIndex]);

  useEffect(() => {
    if (!pickingAirport || airportQuery.trim().length < 2) {
      setAirportHits([]);
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        const result = await fetchAirports(airportQuery);
        if (result.ok) setAirportHits(result.data);
      })();
    }, 200);
    return () => clearTimeout(t);
  }, [airportQuery, pickingAirport]);

  function onSelectPin(code: string) {
    const pin = pinToAirport(code);
    if (!pin) return;
    dispatch({
      type: "selectDestination",
      airport: {
        code: pin.code,
        city: pin.city,
        name: pin.name,
        countryCode: pin.countryCode,
        lat: pin.lat,
        lng: pin.lng,
      },
    });
    setPickingAirport(false);
    setSheetIndex(1);
  }

  function onSelectAirport(airport: AirportVM) {
    dispatch({ type: "selectDestination", airport });
    setPickingAirport(false);
    setAirportQuery("");
    setSheetIndex(1);
  }

  function onOfferPress(offerId: string) {
    const fareByOffer: Record<string, string> = {
      london: "00000000-0000-4000-8000-00000000fa01",
      paris: "00000000-0000-4000-8000-00000000fa03",
      tokyo: "00000000-0000-4000-8000-00000000fa04",
    };
    const fareId = fareByOffer[offerId];
    if (fareId) router.push(fareHref(fareId));
  }

  function onFarePress(id: string) {
    router.push(fareHref(id));
  }

  function onQuotePress() {
    // Branch 2.3: opens RequestSheet with neither fareId nor offerId.
    router.push(fareHref("00000000-0000-4000-8000-00000000fa01"));
  }

  const searchValue = state.to
    ? { prefix: `${state.from?.code ?? "JFK"} → `, text: `${state.to.city} · ${state.to.code}` }
    : null;

  const inspire = asOffers(home?.sections.find((s) => s.key === "inspire")?.items ?? []);
  const expandedSections = (home?.sections ?? []).filter((s) => s.key !== "inspire");

  return (
    <View testID="explore.root" style={styles.root}>
      {offline ? (
        <View style={[styles.banner, { paddingTop: insets.top }]}>
          <Text style={styles.bannerText}>{"You're offline — showing saved offers"}</Text>
        </View>
      ) : (
        <View style={{ height: insets.top }} />
      )}

      {sheetIndex < 2 ? (
        <View style={styles.globeWrap} pointerEvents="box-none">
          <GlobeFallback pins={pins} home={homeCoord} selected={state.to?.code ?? null} onSelect={onSelectPin} />
        </View>
      ) : null}

      <HomeSheet index={sheetIndex} onChange={setSheetIndex}>
        {homeError ? (
          <ErrorState
            variant="error"
            title="Something went wrong."
            body={homeError}
            primary={{ label: "Try again", onPress: () => void loadHome() }}
            testID="explore.error"
          />
        ) : (
          <>
            <SearchField
              testID="explore.search"
              placeholder="Where to?"
              value={searchValue}
              onPress={() => {
                setPickingAirport(true);
                setSheetIndex(2);
              }}
              onClear={() => {
                dispatch({ type: "clearDestination" });
                setSheetIndex(0);
              }}
              disabled={offline}
              disabledReason="Search needs a connection"
            />

            {pickingAirport ? (
              <View style={styles.airportPicker}>
                <TextInput
                  testID="explore.airportQuery"
                  value={airportQuery}
                  onChangeText={setAirportQuery}
                  placeholder="City or code"
                  placeholderTextColor={tokens.colors.textTertiary}
                  style={styles.airportInput}
                  autoFocus
                />
                {airportHits.map((a) => (
                  <AirportRow
                    key={a.code}
                    testID={`explore.airport.${a.code}`}
                    code={a.code}
                    city={a.city}
                    airport={a.name}
                    countryCode={a.countryCode}
                    onPress={() => onSelectAirport(a)}
                  />
                ))}
              </View>
            ) : null}

            {state.to && !pickingAirport ? (
              <View style={styles.chips}>
                <Chip
                  testID="explore.chip.dates"
                  label={state.dates.depart ? state.dates.depart : "Dates"}
                  icon="dates"
                  selected={!!state.dates.depart}
                  onPress={() =>
                    dispatch({
                      type: "setDates",
                      dates: { depart: "2026-10-12", return: "2026-10-19", flexible: false },
                    })
                  }
                />
                <Chip
                  testID="explore.chip.cabin"
                  label={state.cabin === "business" ? "Business" : "First"}
                  icon="cabin"
                  selected
                  onPress={() =>
                    dispatch({ type: "setCabin", cabin: state.cabin === "business" ? "first" : "business" })
                  }
                />
                <Chip
                  testID="explore.chip.travelers"
                  label={`${state.passengers.adult} adult`}
                  icon="passengers"
                  selected={state.passengers.adult > 1}
                  onPress={() =>
                    dispatch({
                      type: "setPassengers",
                      passengers: { ...state.passengers, adult: state.passengers.adult === 1 ? 2 : 1 },
                    })
                  }
                />
              </View>
            ) : null}

            {state.to && !pickingAirport && state.status === "searching" ? (
              <View style={styles.skeletons}>
                <View style={styles.skeletonRow} />
                <View style={styles.skeletonRow} />
                <View style={styles.skeletonRow} />
              </View>
            ) : null}

            {state.to && !pickingAirport && state.status === "done" && state.results ? (
              <>
                <SectionLabel label={`${state.results.length} fares · lowest first`} />
                {state.results.map((fare) => (
                  <FareRow
                    key={fare.id}
                    testID={`explore.fare.${fare.id}`}
                    fare={fare}
                    onPress={() => onFarePress(fare.id)}
                  />
                ))}
                <Pressable
                  testID="explore.quote"
                  accessibilityRole="button"
                  accessibilityLabel="Request a quote"
                  onPress={onQuotePress}
                  style={({ pressed }) => [styles.quote, pressed && styles.pressed]}
                >
                  <Text style={styles.quoteText}>Nothing that fits? Request a quote →</Text>
                </Pressable>
              </>
            ) : null}

            {state.to && !pickingAirport && state.status === "empty" ? (
              <EmptyState
                testID="explore.empty"
                title={`We don't publish fares for ${state.from?.code ?? "JFK"} → ${state.to.code}.`}
                body="We find them. Tell us your dates and a specialist calls you with options — usually 30–50 % under the published fare."
                primary={{ label: "Request a quote", onPress: onQuotePress }}
              />
            ) : null}

            {state.status === "error" && state.errorMessage ? (
              <ErrorState
                variant="error"
                title="Something went wrong."
                body={state.errorMessage}
                primary={{ label: "Try again", onPress: () => void loadHome() }}
                testID="explore.searchError"
              />
            ) : null}

            {!state.to && !pickingAirport ? (
              <>
                {homeLoading ? (
                  <View style={styles.skeletons}>
                    <View style={[styles.skeletonCard, { width: 180 }]} />
                    <View style={[styles.skeletonCard, { width: 180 }]} />
                  </View>
                ) : (
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
                          onPress={() => onOfferPress(item.id)}
                        />
                      ))}
                    </CarouselRow>
                  </>
                )}
              </>
            ) : null}

            {sheetIndex === 2 && !pickingAirport && !state.to ? (
              <>
                {expandedSections.map((section) => (
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
                          onPress={() => onOfferPress(item.id)}
                        />
                      ))}
                    </CarouselRow>
                  </View>
                ))}
              </>
            ) : null}

            {homeLoading && !home ? (
              <ActivityIndicator color={tokens.colors.primary} style={{ marginTop: tokens.space.lg }} />
            ) : null}
          </>
        )}
      </HomeSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.primary },
  banner: {
    height: 36,
    backgroundColor: tokens.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: tokens.space.lg,
  },
  bannerText: { ...rn(tokens.type.caption), color: tokens.colors.textOnDark },
  globeWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 520,
    alignItems: "center",
    justifyContent: "center",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: tokens.space.xs,
    marginTop: tokens.space.sm,
  },
  skeletons: { marginTop: tokens.space.md, gap: tokens.space.md },
  skeletonRow: {
    height: 80,
    borderRadius: tokens.radius.card,
    backgroundColor: tokens.colors.borderDefault,
  },
  skeletonCard: {
    height: 120,
    borderRadius: tokens.radius.card,
    backgroundColor: tokens.colors.borderDefault,
    marginRight: tokens.space.sm,
  },
  quote: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.card,
    padding: tokens.space.md,
    marginTop: tokens.space.sm,
  },
  quoteText: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  pressed: { opacity: 0.85 },
  airportPicker: { marginTop: tokens.space.sm },
  airportInput: {
    height: 56,
    borderRadius: tokens.radius.field,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    paddingHorizontal: tokens.space.md,
    ...rn(tokens.type.body),
    color: tokens.colors.textPrimary,
    backgroundColor: tokens.colors.surfaceCard,
    marginBottom: tokens.space.sm,
  },
});
