import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AirportVM, FareVM } from "@bbc/shared/api/v1/fares";
import { Button, Photo, PhotoCredit, StateMessage, tokens } from "@bbc/ui";

import { RequestSheet, type RequestSheetHandle } from "@/components/RequestSheet";
import { RootTabBar } from "@/components/RootTabBar";
import { ScreenStatusBar } from "@/components/screen-status-bar";
import { DestinationDetails } from "@/features/explore/DestinationDetails";
import { destinationFromParams } from "@/features/explore/destination-route";
import { HOME_AIRPORT_MESSAGE, isHomeAirport } from "@/features/explore/discovery-logic";
import { fareHref } from "@/features/explore/open-offer";
import { rememberDates } from "@/features/explore/recent-searches";
import {
  type CabinSheetHandle,
  SearchCabinSheet,
  SearchTravelersSheet,
  type TravelersSheetHandle,
} from "@/features/explore/SearchPreferenceSheets";
import { DEFAULT_ORIGIN, profileOrigin } from "@/features/explore/useExploreHome";
import { useOffline } from "@/features/explore/useOffline";
import { clubPhoto } from "@/features/places/club-photos";
import { Landmarks } from "@/features/places/Landmarks";
import { bandPicture } from "@/features/places/place-photo-logic";
import { usePlaceLandmarks } from "@/features/places/usePlaceLandmarks";
import { PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";
import { DatesPage, type DatesPageHandle } from "@/features/requests/DatesPage";
import type { SearchContext } from "@/features/requests/useRequestDraft";
import { useSearch } from "@/features/search/useSearch";
import { useProfile } from "@/features/profile/useProfile";
import { env } from "@/lib/env";
import { statusBarOn } from "@/lib/status-bar-logic";

/**
 * 04, on a 47-pt status bar: the city's photograph from the screen's top, the sheet over its foot from 217.9 with
 * 20-pt corners and no grabber; `Request a quote` 36.6 tall, 12.9 and 13.5 from the edges, its foot 59.8 over the tab
 * bar. No button over the photograph: back is the swipe, Android's Back, or the Explore tab.
 */
const PAGE = {
  sheetTop: 217.9 - 47,
  corner: 20,
  // Its foot 59.8 over the tab bar's top (59.3 over its hairline); its words 0.14 higher than centred.
  pill: { height: 36.6, left: 12.9, right: 13.5, aboveTabs: 59.3, wordsLift: 0.14 },
};

/**
 * A destination chosen on Search (04): the city's photograph, then the same destination as Explore's sheet shows (13) —
 * its country, the trip's chips, the fare's summary and local time, the flight options — then up to three of the city's
 * landmarks with their credits (ADR-IMPL-064; the images draw none), and `Request a quote` over the tab bar.
 */
export default function DestinationScreen() {
  const params = useLocalSearchParams();
  const chosen = destinationFromParams(params);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const requestRef = useRef<RequestSheetHandle>(null);
  const datesRef = useRef<DatesPageHandle>(null);
  const cabinRef = useRef<CabinSheetHandle>(null);
  const travelersRef = useRef<TravelersSheetHandle>(null);
  // The one profile every screen shares (F104): read, or asked once.
  const profile = useProfile();
  const { offline, refresh } = useOffline();
  // The search's origin comes with the page (Search passes it); without it (a link, an older list) the profile's
  // airport — never all of Home just to learn it (F104).
  const given = chosen?.origin ?? null;
  const [found, setFound] = useState<AirportVM | null>(null);
  useEffect(() => {
    if (given) return;
    let cancelled = false;
    void (async () => {
      const airport = await profileOrigin();
      if (!cancelled) setFound(airport);
    })().catch(() => {
      if (!cancelled) setFound(DEFAULT_ORIGIN);
    });
    return () => {
      cancelled = true;
    };
  }, [given?.code]);
  const { state, dispatch, retry } = useSearch({ defaultFrom: given ?? found });
  const photoFor = usePlacePhotos([chosen?.airport.code]);
  // Up to three landmarks of the city, each with its name and credit (ADR-IMPL-064); none — nothing at all.
  const landmarks = usePlaceLandmarks(chosen?.airport.code);

  // The member's usual cabin and travelers first, then the destination with the dates it was last searched for.
  const usualCabin = profile?.preferences.cabin;
  const usualPassengers = profile?.preferences.passengers;
  useEffect(() => {
    if (usualCabin || usualPassengers) {
      dispatch({ type: "seedPreferences", cabin: usualCabin, passengers: usualPassengers });
    }
  }, [usualCabin, usualPassengers]);

  const code = chosen?.airport.code;
  useEffect(() => {
    if (!chosen) return;
    dispatch({ type: "selectDestination", airport: chosen.airport });
    if (chosen.dates) {
      dispatch({
        type: "setDates",
        dates: { depart: chosen.dates.depart, return: chosen.dates.return, flexible: chosen.dates.depart === null },
      });
    }
  }, [code]);

  if (!chosen) {
    return (
      <View style={[styles.root, styles.missing, { paddingTop: insets.top }]} testID="destination.root">
        <ScreenStatusBar on="light" />
        <StateMessage
          testID="destination.missing"
          variant="error"
          title="This destination is not available."
          body="Search for it again from Explore."
          primary={{ label: "Back to Explore", onPress: () => router.back() }}
        />
      </View>
    );
  }

  const search: SearchContext = { dates: state.dates, cabin: state.cabin, passengers: state.passengers };
  // Opened on the member's own airport (a link, a list from before): no search and no quote for a trip to itself.
  const ownAirport = isHomeAirport(chosen.airport.code, state.from);
  const heroHeight = insets.top + PAGE.sheetTop + PAGE.corner;
  // The design's own photograph of the city where it has one (ADR-IMPL-056), else the server's place photo.
  const bundled = clubPhoto(chosen.airport.code, "any");
  const band = bandPicture(undefined, photoFor(chosen.airport.code), {
    headers: PICTURE_HEADERS,
    mapboxToken: env.EXPO_PUBLIC_MAPBOX_TOKEN,
    size: { width, height: heroHeight },
  });
  const credit = bundled ? null : band.credit;
  const creditLink = credit?.link ?? null;

  function retrySearch() {
    void (async () => {
      const stillOffline = await refresh();
      if (!stillOffline) retry();
    })();
  }

  return (
    <View style={styles.root} testID="destination.root">
      <ScreenStatusBar on={statusBarOn({ hasImage: Boolean(bundled ?? band.source), pastHero: false })} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={{ height: heroHeight }}>
          <Photo
            source={bundled ?? band.source}
            fallback={null}
            cachePolicy={bundled ? "memory-disk" : band.cache}
            position="top"
            style={StyleSheet.absoluteFill}
            testID="destination.photo"
          />
        </View>
        <View style={styles.sheet}>
          {ownAirport ? (
            <View style={styles.own}>
              <StateMessage
                testID="destination.home"
                align="center"
                title={HOME_AIRPORT_MESSAGE.title}
                body={HOME_AIRPORT_MESSAGE.body}
                primary={{
                  label: "Search a city",
                  testID: "destination.home.search",
                  onPress: () => router.replace("/search" as Href),
                }}
              />
            </View>
          ) : (
            <DestinationDetails
              look="page"
              testIDPrefix="destination"
              state={state}
              offline={offline}
              onRetry={retrySearch}
              onOpenFare={(fare: FareVM) =>
                router.push(
                  fareHref(fare.id, fare.offerId, {
                    depart: state.dates.depart,
                    return: state.dates.return,
                    passengers: state.passengers,
                  }),
                )
              }
              onEditDates={() =>
                datesRef.current?.present(
                  {
                    tripType: state.dates.depart && !state.dates.return ? "oneway" : "round",
                    depart: state.dates.depart,
                    ret: state.dates.return,
                    editing: "depart",
                  },
                  {
                    fromCity: state.from?.city,
                    toCity: chosen.airport.city,
                    toCode: chosen.airport.code,
                    flexible: state.dates.flexible,
                  },
                )
              }
              onEditCabin={() => cabinRef.current?.present(state.cabin)}
              onEditTravelers={() => travelersRef.current?.present(state.passengers)}
            />
          )}
          {credit ? (
            // The credit the photograph owes (ADR-IMPL-043).
            <PhotoCredit
              testID="destination.photoCredit"
              label={credit.label}
              accessibilityLabel={credit.spoken}
              onPress={
                creditLink
                  ? () => {
                      Linking.openURL(creditLink).catch(() => undefined);
                    }
                  : undefined
              }
            />
          ) : null}
          {ownAirport ? null : <Landmarks landmarks={landmarks} testIDPrefix="destination" />}
        </View>
      </ScrollView>
      {ownAirport ? null : (
        <View style={styles.footer}>
          <Button
            testID="destination.quote"
            label="Request a quote"
            variant="primary"
            height={PAGE.pill.height}
            text="buttonBold"
            style={{ paddingBottom: 2 * PAGE.pill.wordsLift }}
            onPress={() =>
              requestRef.current?.present({
                fare: null,
                profile,
                fromCode: state.from?.code,
                toCode: chosen.airport.code,
                fromCity: state.from?.city,
                city: chosen.airport.city,
                search,
                estimateShown: state.status === "empty" && state.estimate !== null,
              })
            }
          />
        </View>
      )}
      <RootTabBar active="explore" />
      <RequestSheet ref={requestRef} />
      <DatesPage
        ref={datesRef}
        onFlexible={() => {
          dispatch({ type: "setDates", dates: { depart: null, return: null, flexible: true } });
          // Flexible: the dates remembered for the destination are forgotten, so Search brings none back.
          rememberDates(chosen.airport.code, null);
        }}
        onUse={(sel) => {
          const dates = {
            depart: sel.depart,
            return: sel.tripType === "oneway" ? null : sel.ret,
            flexible: sel.depart === null,
          };
          dispatch({ type: "setDates", dates });
          rememberDates(chosen.airport.code, { depart: dates.depart, return: dates.return });
        }}
      />
      <SearchCabinSheet ref={cabinRef} onPick={(cabin) => dispatch({ type: "setCabin", cabin })} />
      <SearchTravelersSheet
        ref={travelersRef}
        onPick={(passengers) => dispatch({ type: "setPassengers", passengers })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  missing: { justifyContent: "center", paddingHorizontal: tokens.space.gutter },
  own: { paddingHorizontal: tokens.space.gutter, paddingVertical: tokens.space.xl },
  scroll: { paddingBottom: tokens.space.lg },
  sheet: {
    marginTop: -PAGE.corner,
    borderTopLeftRadius: PAGE.corner,
    borderTopRightRadius: PAGE.corner,
    backgroundColor: tokens.colors.surfaceCard,
    gap: tokens.space.md,
  },
  // The pill over the tab bar, the sheet's white around it (04): the page scrolls under it, the last card 9 pt above.
  footer: {
    paddingLeft: PAGE.pill.left,
    paddingRight: PAGE.pill.right,
    paddingBottom: PAGE.pill.aboveTabs,
    backgroundColor: tokens.colors.surfaceCard,
  },
});
