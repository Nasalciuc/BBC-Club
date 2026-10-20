import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { FareVM } from "@bbc/shared/api/v1/fares";
import { BackButton, Button, Photo, PhotoCredit, StateMessage, tokens } from "@bbc/ui";

import { RequestSheet, type RequestSheetHandle } from "@/components/RequestSheet";
import { RootTabBar } from "@/components/RootTabBar";
import { ScreenStatusBar } from "@/components/screen-status-bar";
import { DestinationDetails } from "@/features/explore/DestinationDetails";
import { destinationFromParams } from "@/features/explore/destination-route";
import { fareHref } from "@/features/explore/open-offer";
import { rememberDates } from "@/features/explore/recent-searches";
import {
  type CabinSheetHandle,
  SearchCabinSheet,
  SearchTravelersSheet,
  type TravelersSheetHandle,
} from "@/features/explore/SearchPreferenceSheets";
import { useExploreHome } from "@/features/explore/useExploreHome";
import { useOffline } from "@/features/explore/useOffline";
import { bandPicture } from "@/features/places/place-photo-logic";
import { CLUB_PICTURE, PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";
import { DatesPage, type DatesPageHandle } from "@/features/requests/DatesPage";
import type { SearchContext } from "@/features/requests/useRequestDraft";
import { useSearch } from "@/features/search/useSearch";
import { fetchProfile, type Profile } from "@/lib/api";
import { env } from "@/lib/env";

/** 04: the city's photograph across the top, the sheet over its foot with 24-pt corners. */
const HERO = 240;
const OVERLAP = 24;

/**
 * A destination chosen on Search (04): the city's photograph, then the same destination as Explore's sheet shows (13) —
 * its country, the trip's chips, the fare's summary and local time, the flight options — and `Request a quote` over
 * the tab bar.
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
  const [profile, setProfile] = useState<Profile | null>(null);
  const { offline, refresh } = useOffline();
  const { defaultFrom } = useExploreHome();
  const { state, dispatch, retry } = useSearch({ defaultFrom });
  const photoFor = usePlacePhotos([chosen?.airport.code]);

  useEffect(() => {
    void (async () => {
      const result = await fetchProfile();
      if (result.ok) setProfile(result.data);
    })();
  }, []);

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
  const band = bandPicture(undefined, photoFor(chosen.airport.code), {
    headers: PICTURE_HEADERS,
    mapboxToken: env.EXPO_PUBLIC_MAPBOX_TOKEN,
    size: { width, height: HERO },
  });
  const credit = band.credit;
  const creditLink = credit?.link ?? null;

  function retrySearch() {
    void (async () => {
      const stillOffline = await refresh();
      if (!stillOffline) retry();
    })();
  }

  return (
    <View style={styles.root} testID="destination.root">
      <ScreenStatusBar on="dark" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <Photo
            source={band.source}
            fallback={CLUB_PICTURE}
            cachePolicy={band.cache}
            style={StyleSheet.absoluteFill}
            testID="destination.photo"
          />
          <BackButton
            testID="destination.back"
            variant="photo"
            onPress={() => router.back()}
            style={StyleSheet.flatten([styles.back, { top: insets.top + tokens.space.xs }])}
          />
        </View>
        <View style={styles.sheet}>
          <DestinationDetails
            framed
            testIDPrefix="destination"
            state={state}
            offline={offline}
            onRetry={retrySearch}
            onOpenFare={(fare: FareVM) => router.push(fareHref(fare.id, fare.offerId))}
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
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <Button
          testID="destination.quote"
          label="Request a quote"
          variant="primary"
          trailing="chevron"
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
      <RootTabBar active="explore" />
      <RequestSheet ref={requestRef} />
      <DatesPage
        ref={datesRef}
        onFlexible={() => dispatch({ type: "setDates", dates: { depart: null, return: null, flexible: true } })}
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
  scroll: { paddingBottom: tokens.space.lg },
  hero: { height: HERO },
  back: { position: "absolute", left: tokens.space.gutter },
  sheet: {
    marginTop: -OVERLAP,
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    backgroundColor: tokens.colors.surfacePage,
    paddingTop: tokens.space.lg,
    paddingHorizontal: tokens.space.gutter,
    gap: tokens.space.md,
  },
  footer: {
    paddingHorizontal: tokens.space.gutter,
    paddingTop: tokens.space.sm,
    paddingBottom: tokens.space.sm,
    backgroundColor: tokens.colors.surfacePage,
  },
});
