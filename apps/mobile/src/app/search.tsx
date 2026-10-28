import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Keyboard, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AirportVM } from "@bbc/shared/api/v1/fares";
import {
  AirportRow,
  EmptyState,
  NoticeCard,
  PopularCard,
  RecentRow,
  SearchField,
  SectionHeader,
  Skeleton,
  StateMessage,
  baselineOffset,
  belowBaseline,
  rn,
  tokens,
} from "@bbc/ui";

import { ScreenStatusBar } from "@/components/screen-status-bar";
import {
  type HomeLoad,
  airportLine,
  airportName,
  popularLabel,
  popularRows,
  popularState,
  withoutHome,
} from "@/features/explore/discovery-logic";
import { destinationHref } from "@/features/explore/destination-route";
import { clearRecentSearches, readRecentSearches, rememberSearch } from "@/features/explore/recent-searches";
import type { RecentDates } from "@/features/explore/recent-search-logic";
import { datesChipLabel } from "@/features/explore/travel-preferences";
import { clubPhoto, clubSearchPhotoHeight } from "@/features/places/club-photos";
import { cardPicture } from "@/features/places/place-photo-logic";
import { PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";
import { airportSearchState } from "@/lib/airport-search-state";
import { fetchAirports, fetchHome, fetchPopular } from "@/lib/api";
import { readFailureCopy, stateCopy } from "@/lib/error-context";
import { formatPrice } from "@/lib/format";
import { nextShownHome, type ShownHome } from "@/lib/home-shown-logic";

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
  const [remembered, setRemembered] = useState(() => readRecentSearches());
  // Home and the tag it came with: a 304 keeps it only for that tag (home-shown-logic.ts).
  const [shown, setShown] = useState<ShownHome | null>(null);
  const home = shown?.home ?? null;
  // Loading, answered, or failed with its code (offline or not): a failed Home shows its message with `Try again`,
  // never skeletons for ever (F011).
  const [homeLoad, setHomeLoad] = useState<{ state: HomeLoad; code?: string }>({ state: "loading" });
  const [homeAttempt, setHomeAttempt] = useState(0);
  const [popular, setPopular] = useState<AirportVM[] | null>(null);

  // Home names the origin (`Popular from New York`) and the starting fares on the cards. The loading state is set by
  // the first mount (`useState`) and by `Try again` — never inside this effect (`react-hooks/set-state-in-effect`).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetchHome();
      if (cancelled) return;
      if (!res.ok) {
        setHomeLoad({ state: "failed", code: res.code });
        return;
      }
      // Asked with the tag of what this session last received (lib/api.ts): a 304 brings that copy back.
      const answer = res.data;
      setShown((current) => nextShownHome(current, answer));
      setHomeLoad({ state: "ok" });
    })().catch(() => {
      if (!cancelled) setHomeLoad({ state: "failed" });
    });
    return () => {
      cancelled = true;
    };
  }, [homeAttempt]);

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
  // The member's own airport is where the trip starts, never a destination (F013): left out of the airports found
  // and of the recent searches.
  const recent = withoutHome(remembered, from);
  const airportHits = withoutHome(result.airports, from);
  const airportPhase = result.phase === "results" && airportHits.length === 0 ? "empty" : result.phase;
  const recentAirports = recent.map((r) => r.airport);
  const shownPopular = popularRows(popular ?? suggestions, from);
  const before = popularState({ popular: shownPopular.length, recent: recent.length, load: homeLoad.state });
  const homeFailure = readFailureCopy(homeLoad.code, "explore");
  const photoFor = usePlacePhotos([...shownPopular, ...recentAirports].map((a) => a.code));
  const priceOf = (code: string) => {
    const d = home?.destinations.find((x) => x.code === code);
    return d ? formatPrice(d.fromPrice, "USD") : null;
  };

  function choose(airport: AirportVM, dates: RecentDates | null = null) {
    Keyboard.dismiss();
    rememberSearch(airport, dates);
    // The origin rides along: the destination page never loads all of Home to learn it (F104).
    router.replace(destinationHref(airport, dates, from));
  }

  return (
    <View style={[styles.root, { paddingTop: Math.max(0, insets.top - STATUS_BAR + FIELD_TOP) }]} testID="search.root">
      <ScreenStatusBar on="light" />
      <View style={styles.field}>
        <SearchField
          testID="explore.airportQuery"
          editable
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
          airportPhase === "empty" ? (
            <View style={styles.message}>
              <EmptyState
                testID="search.empty"
                look="search"
                icon="search"
                title="No airports found"
                body="Try a city name or a three-letter airport code, such as JFK."
                primary={{ label: "Clear search", onPress: () => setQuery("") }}
                primaryVariant="outline"
                primaryFill={false}
              />
            </View>
          ) : airportPhase === "error" ? (
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
            <View style={styles.airports}>
              <SectionHeader title="Airports" size="title" />
              <View style={styles.airportRows}>
                {result.phase === "loading" && result.airports.length === 0 ? (
                  <>
                    <Skeleton height={55} radius="sm" />
                    <Skeleton height={55} radius="sm" />
                  </>
                ) : (
                  airportHits.map((a) => (
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
            </View>
          )
        ) : (
          <>
            {before === "cards" ? (
              <View style={styles.popular}>
                <SectionHeader title={from ? popularLabel(from) : "Popular"} size="titleSm" />
                <View style={styles.cards}>
                  {shownPopular.map((a) => (
                    <PopularCard
                      key={a.code}
                      testID={`search.popular.${a.code}`}
                      city={a.city}
                      airport={airportName(a)}
                      code={a.code}
                      fromPrice={priceOf(a.code)}
                      image={clubPhoto(a.code, "search") ?? cardPicture(undefined, photoFor(a.code), PICTURE_HEADERS)}
                      photoHeight={clubSearchPhotoHeight(a.code)}
                      fallback={null}
                      onPress={() => choose(a)}
                    />
                  ))}
                </View>
              </View>
            ) : before === "skeleton" ? (
              <View style={styles.popular}>
                <Skeleton width={220} height={22} radius="pill" />
                <View style={styles.cards}>
                  <Skeleton height={166} radius="sm" />
                  <Skeleton height={166} radius="sm" />
                </View>
              </View>
            ) : before === "error" ? (
              // Home did not load: its message in the cards' place, and `Try again` asks once more. Typing and the
              // recent searches still work.
              <View style={styles.popular}>
                <NoticeCard
                  testID="search.home.error"
                  tone={homeLoad.code === "OFFLINE" ? "offline" : "error"}
                  title={homeFailure.title}
                  body={homeFailure.body}
                  link={{
                    label: "Try again",
                    onPress: () => {
                      setHomeLoad({ state: "loading" });
                      setHomeAttempt((n) => n + 1);
                    },
                    testID: "search.home.error.retry",
                  }}
                />
              </View>
            ) : null}
            {recent.length > 0 ? (
              <View style={before === "hint" || before === "none" ? styles.popular : styles.recent}>
                <SectionHeader
                  title="Recent searches"
                  size="titleSm"
                  action={{
                    label: "Clear all",
                    tone: "link",
                    testID: "search.recent.clear",
                    onPress: () => {
                      clearRecentSearches();
                      setRemembered([]);
                    },
                  }}
                />
                <View style={styles.rows}>
                  {recent.map((r) => (
                    <RecentRow
                      key={r.airport.code}
                      testID={`explore.airport.recent.${r.airport.code}`}
                      city={r.airport.city}
                      detail={r.dates?.depart ? datesChipLabel(r.dates) : airportLine(r.airport)}
                      image={
                        clubPhoto(r.airport.code, "any") ??
                        cardPicture(undefined, photoFor(r.airport.code), PICTURE_HEADERS)
                      }
                      fallback={null}
                      onPress={() => choose(r.airport, r.dates)}
                    />
                  ))}
                </View>
              </View>
            ) : null}
            {before === "hint" || before === "error" ? (
              <Text style={styles.hint}>Type a city or an airport code.</Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/**
 * 03 and 18, measured on a 47-pt status bar: the field's top 42.8 pt down (4.2 pt into the status bar's room), 15.2 pt
 * from the left, `Cancel` ending 15.7 pt from the right; the first title's baseline 37 pt under the field; a card
 * 12.7 pt under its title's baseline, 166 pt tall, 8.2 pt apart; `Recent searches` 28.8 pt under the last card; rows
 * 13.4 pt under it, 5 pt apart. While typing (18): `Airports` 38.4 pt under the field, rows 15.3 pt under it, 6.5 apart.
 */
const STATUS_BAR = 47;
const FIELD_TOP = 42.8;
const GUTTER = { left: 15.2, right: 15.7 } as const;
const titleSm = tokens.type.titleSm;
const title = tokens.type.title;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  field: { paddingLeft: GUTTER.left, paddingRight: GUTTER.right },
  content: { paddingLeft: GUTTER.left, paddingRight: GUTTER.right - 0.5 },
  popular: { marginTop: 37.1 - baselineOffset(titleSm) },
  cards: { marginTop: 12.7 - belowBaseline(titleSm), gap: 8.2 },
  recent: { marginTop: 28.8 - baselineOffset(titleSm) },
  rows: { marginTop: 13.4 - belowBaseline(titleSm), gap: 5 },
  airports: { marginTop: 38.4 - baselineOffset(title) },
  airportRows: { marginTop: 15.3 - belowBaseline(title), gap: 6.5 },
  message: { marginTop: tokens.space.xxl },
  hint: { ...rn(tokens.type.body), color: tokens.colors.textSecondary, marginTop: tokens.space.lg },
});
