import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Keyboard, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AirportVM, HomeVM } from "@bbc/shared/api/v1/fares";
import {
  AirportRow,
  EmptyState,
  PopularCard,
  RecentRow,
  SearchField,
  SectionHeader,
  Skeleton,
  StateMessage,
  rn,
  tokens,
} from "@bbc/ui";

import { ScreenStatusBar } from "@/components/screen-status-bar";
import { airportLine, airportName, popularLabel, popularRows } from "@/features/explore/discovery-logic";
import { destinationHref } from "@/features/explore/destination-route";
import { clearRecentSearches, readRecentSearches, rememberSearch } from "@/features/explore/recent-searches";
import type { RecentDates } from "@/features/explore/recent-search-logic";
import { datesChipLabel } from "@/features/explore/travel-preferences";
import { cardPicture } from "@/features/places/place-photo-logic";
import { CLUB_PICTURE, PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";
import { airportSearchState } from "@/lib/airport-search-state";
import { fetchAirports, fetchHome, fetchPopular } from "@/lib/api";
import { stateCopy } from "@/lib/error-context";
import { formatPrice } from "@/lib/format";

/**
 * Search (03, 18): the field with `Cancel`; before typing, `Popular from <city>` (the routes members search, then the
 * hubs — three, ADR-IMPL-039) as photo cards and `Recent searches` with their dates; while typing, `Airports`. A choice
 * opens the destination's page (04).
 */
export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(() => airportSearchState<AirportVM>("idle"));
  // `Try again` runs the search effect once more; an answer that comes after the member typed on is dropped.
  const [attempt, setAttempt] = useState(0);
  const [recent, setRecent] = useState(() => readRecentSearches());
  const [home, setHome] = useState<HomeVM | null>(null);
  const [popular, setPopular] = useState<AirportVM[] | null>(null);

  // Home names the origin (`Popular from New York`) and the starting fares on the cards.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetchHome();
      if (!cancelled && res.ok && !res.data.notModified) setHome(res.data.home);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const from = home?.home ?? null;
  const fromCode = from?.code;
  useEffect(() => {
    if (!fromCode) return;
    let cancelled = false;
    void (async () => {
      const res = await fetchPopular(fromCode);
      // No popular list (an older server, a failure): Home's destinations stand in.
      if (!cancelled) setPopular(res.ok ? res.data.destinations : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [fromCode]);

  const typing = query.trim().length >= 2;
  useEffect(() => {
    if (!typing) {
      setResult(airportSearchState("idle"));
      return;
    }
    setResult(airportSearchState("loading"));
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        const res = await fetchAirports(query);
        if (!cancelled) setResult(airportSearchState(res));
      })();
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, typing, attempt]);

  const suggestions: AirportVM[] = (home?.destinations ?? []).map((d) => ({
    code: d.code,
    city: d.city,
    name: d.name,
    countryCode: d.countryCode,
    lat: d.lat,
    lng: d.lng,
  }));
  const recentAirports = recent.map((r) => r.airport);
  const shownPopular = popularRows(popular ?? suggestions, recentAirports, from);
  const photoFor = usePlacePhotos([...shownPopular, ...recentAirports].map((a) => a.code));
  const priceOf = (code: string) => {
    const d = home?.destinations.find((x) => x.code === code);
    return d ? formatPrice(d.fromPrice, "USD") : null;
  };

  function choose(airport: AirportVM, dates: RecentDates | null = null) {
    Keyboard.dismiss();
    rememberSearch(airport, dates);
    router.replace(destinationHref(airport, dates));
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + tokens.space.xs }]} testID="search.root">
      <ScreenStatusBar on="light" />
      <View style={styles.field}>
        <SearchField
          testID="explore.airportQuery"
          editable
          autoFocus
          tone="field"
          placeholder="Where would you like to go?"
          value={query ? { text: query } : null}
          onChangeText={setQuery}
          onClear={() => setQuery("")}
          onCancel={() => {
            Keyboard.dismiss();
            router.back();
          }}
        />
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + tokens.space.lg }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {typing ? (
          result.phase === "empty" ? (
            <View style={styles.message}>
              <EmptyState
                testID="search.empty"
                icon="search"
                title="No airports found"
                body="Try a city name or a three-letter airport code, such as JFK."
                primary={{ label: "Clear search", onPress: () => setQuery("") }}
                primaryVariant="outline"
                primaryFill={false}
              />
            </View>
          ) : result.phase === "error" ? (
            <View style={styles.message}>
              <StateMessage
                testID="search.error"
                variant="error"
                title={stateCopy("generic").title}
                body={stateCopy("generic").body}
                primary={{ label: "Try again", onPress: () => setAttempt((n) => n + 1) }}
              />
            </View>
          ) : (
            <View style={styles.section}>
              <SectionHeader title="Airports" size="small" />
              {result.phase === "loading" && result.airports.length === 0 ? (
                <>
                  <Skeleton height={72} radius="md" />
                  <Skeleton height={72} radius="md" />
                </>
              ) : (
                result.airports.map((a) => (
                  <AirportRow
                    key={a.code}
                    testID={`explore.airport.${a.code}`}
                    code={a.code}
                    city={a.city}
                    airport={airportName(a)}
                    onPress={() => choose(a)}
                  />
                ))
              )}
            </View>
          )
        ) : (
          <>
            {shownPopular.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader title={from ? popularLabel(from) : "Popular"} size="small" />
                {shownPopular.map((a) => (
                  <PopularCard
                    key={a.code}
                    testID={`search.popular.${a.code}`}
                    city={a.city}
                    airport={airportLine(a)}
                    fromPrice={priceOf(a.code)}
                    image={cardPicture(undefined, photoFor(a.code), PICTURE_HEADERS)}
                    fallback={CLUB_PICTURE}
                    onPress={() => choose(a)}
                  />
                ))}
              </View>
            ) : home === null ? (
              <View style={styles.section}>
                <Skeleton width={220} height={24} radius="pill" />
                <Skeleton height={166} radius="md" />
                <Skeleton height={166} radius="md" />
              </View>
            ) : null}
            {recent.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader
                  title="Recent searches"
                  size="small"
                  action={{
                    label: "Clear all",
                    testID: "search.recent.clear",
                    onPress: () => {
                      clearRecentSearches();
                      setRecent([]);
                    },
                  }}
                />
                {recent.map((r) => (
                  <RecentRow
                    key={r.airport.code}
                    testID={`explore.airport.recent.${r.airport.code}`}
                    city={r.airport.city}
                    detail={r.dates?.depart ? datesChipLabel(r.dates) : airportLine(r.airport)}
                    image={cardPicture(undefined, photoFor(r.airport.code), PICTURE_HEADERS)}
                    fallback={CLUB_PICTURE}
                    onPress={() => choose(r.airport, r.dates)}
                  />
                ))}
              </View>
            ) : null}
            {shownPopular.length === 0 && recent.length === 0 && home !== null ? (
              <Text style={styles.hint}>Type a city or an airport code.</Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  field: { paddingHorizontal: tokens.space.gutter },
  content: { paddingHorizontal: tokens.space.gutter, paddingTop: tokens.space.lg, gap: tokens.space.lg },
  section: { gap: tokens.space.sm },
  message: { marginTop: tokens.space.xxl },
  hint: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
});
