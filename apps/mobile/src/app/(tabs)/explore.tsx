import { type Href, useIsFocused, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { BackHandler, type LayoutChangeEvent, Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AirportVM, FareVM } from "@bbc/shared/api/v1/fares";
import type { ProposalCardVM } from "@bbc/shared/api/v1/proposals";
import { BackButton, Button, HOME_SHEET_HANDLE, HomeSheet, NoticeCard, SearchField, tokens } from "@bbc/ui";

import { RequestSheet, type RequestSheetHandle } from "@/components/RequestSheet";
import { ScreenStatusBar } from "@/components/screen-status-bar";
import { DestinationDetails } from "@/features/explore/DestinationDetails";
import { globeCentreY, sheetSnaps, sheetTop } from "@/features/explore/explore-layout";
import { firstName } from "@/features/explore/greeting";
import { GreetingHeader } from "@/features/explore/GreetingHeader";
import { cheapestFareOnRoute, fareHref } from "@/features/explore/open-offer";
import { rememberDates, rememberSearch } from "@/features/explore/recent-searches";
import {
  type CabinSheetHandle,
  SearchCabinSheet,
  SearchTravelersSheet,
  type TravelersSheetHandle,
} from "@/features/explore/SearchPreferenceSheets";
import { SheetExpanded } from "@/features/explore/SheetExpanded";
import { SheetRest } from "@/features/explore/SheetRest";
import { SkyBackdrop, SkyClouds } from "@/features/explore/SkyBackdrop";
import { useExploreHome } from "@/features/explore/useExploreHome";
import { useOffline } from "@/features/explore/useOffline";
import { Globe } from "@/features/globe/Globe";
import { useDestinations } from "@/features/globe/useDestinations";
import { DatesSheet, type DatesSheetHandle } from "@/features/requests/DatesSheet";
import type { SearchContext } from "@/features/requests/useRequestDraft";
import { useSearch } from "@/features/search/useSearch";
import { fetchProfile, type Profile } from "@/lib/api";
import { monogram } from "@/lib/monogram";

/** The sheet's stops: at rest (02), a chosen route (13), every offer (16). */
const STOP = { rest: 0, route: 1, all: 2 } as const;
/** 02: the labels stay under the greeting; 13: under the status bar, clear of the back button. */
const BAND_TOP = { rest: 76, route: 8 } as const;
/** The back button over a chosen route (13): 44 pt, 8 pt under the status bar, at the gutter. */
const BACK = 44;

/**
 * Explore (02, 13, 16, 17, 19): the greeting over the globe on the pale sky, the search bar on the globe's foot and the
 * offers under it. A pin chooses a destination in place — the globe flies to the route and the sheet rises with the
 * destination (13); the search bar opens Search (03), whose choices open the destination's page (04).
 */
export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const screen = useWindowDimensions();
  // Another tab, or a fare or a request pushed over the tabs: the globe stays drawn but stops moving (ADR-IMPL-047).
  const focused = useIsFocused();
  const requestRef = useRef<RequestSheetHandle>(null);
  const datesRef = useRef<DatesSheetHandle>(null);
  const cabinRef = useRef<CabinSheetHandle>(null);
  const travelersRef = useRef<TravelersSheetHandle>(null);
  const [size, setSize] = useState({ width: screen.width, height: screen.height });
  const height = size.height;
  const [sheetIndex, setSheetIndex] = useState<number>(STOP.rest);
  const [profile, setProfile] = useState<Profile | null>(null);
  const { offline, refresh } = useOffline();
  const { home, homeLoading, homeError, defaultFrom, retryHome } = useExploreHome();
  const { state, dispatch, retry } = useSearch({ defaultFrom });
  const { pins, homeCoord, pinToAirport } = useDestinations(home, state.to);

  useEffect(() => {
    void (async () => {
      const result = await fetchProfile();
      if (result.ok) setProfile(result.data);
    })();
  }, []);

  // The member's usual cabin and travelers (Profile → Edit profile) are where a search starts, until a chip is touched.
  const usualCabin = profile?.preferences.cabin;
  const usualPassengers = profile?.preferences.passengers;
  useEffect(() => {
    if (usualCabin || usualPassengers) {
      dispatch({ type: "seedPreferences", cabin: usualCabin, passengers: usualPassengers });
    }
  }, [usualCabin, usualPassengers]);

  const mode = state.to ? "route" : sheetIndex >= STOP.all ? "all" : "rest";

  // A chosen destination raises the sheet to its route stop — every choice, the same city tapped twice included: a sheet
  // the member dragged down would otherwise leave the fares under the docked `Request a quote`.
  const [choices, setChoices] = useState(0);
  useEffect(() => {
    if (state.to) setSheetIndex(STOP.route);
  }, [state.to, choices]);

  function selectDestination(airport: AirportVM) {
    rememberSearch(airport);
    dispatch({ type: "selectDestination", airport });
    setChoices((n) => n + 1);
  }

  function clearDestination() {
    dispatch({ type: "clearDestination" });
    setSheetIndex(STOP.rest);
  }

  // Android's Back undoes Explore's own state before it leaves: a route goes back to rest, as the back button does, and
  // every offer comes down as Done brings it (ADR-IMPL-047). A modal sheet over Explore registers later and answers first.
  useEffect(() => {
    if (Platform.OS !== "android" || !focused || mode === "rest") return;
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      if (mode === "route") clearDestination();
      else setSheetIndex(STOP.rest);
      return true;
    });
    return () => back.remove();
  }, [focused, mode]);

  function onSelectPin(code: string) {
    const pin = pinToAirport(code);
    if (!pin) return;
    selectDestination({
      code: pin.code,
      city: pin.city,
      name: pin.name,
      countryCode: pin.countryCode,
      lat: pin.lat,
      lng: pin.lng,
    });
  }

  const search: SearchContext = { dates: state.dates, cabin: state.cabin, passengers: state.passengers };

  function openQuote() {
    requestRef.current?.present({
      fare: null,
      profile,
      fromCode: state.from?.code,
      toCode: state.to?.code,
      fromCity: state.from?.city,
      city: state.to?.city,
      search,
      // The indicative fare is on screen only for an undated search with no published fare: only then does the quote
      // say the member saw it — the server recomputes the number (ADR-IMPL-042).
      estimateShown: state.status === "empty" && state.estimate !== null,
    });
  }

  async function openOffer(card: ProposalCardVM) {
    const fare = await cheapestFareOnRoute(card);
    if (fare) {
      router.push(fareHref(fare.id, card.id));
      return;
    }
    requestRef.current?.present({
      fare: null,
      profile,
      fromCode: card.route.from,
      toCode: card.route.to,
      // The cities by name where Home knows them: the sheet's title and the confirmation's `London is next.`
      fromCity: card.route.from === state.from?.code ? state.from.city : undefined,
      city: home?.destinations.find((d) => d.code === card.route.to)?.city,
      search,
      confirmation: "offer",
      photo: card.mediaUrl,
    });
  }

  function retrySearch() {
    void (async () => {
      const stillOffline = await refresh();
      if (!stillOffline) retry();
    })();
  }

  function onLayout(e: LayoutChangeEvent) {
    const width = Math.round(e.nativeEvent.layout.width);
    const next = Math.round(e.nativeEvent.layout.height);
    if (width !== size.width || next !== size.height) setSize({ width, height: next });
  }

  const snaps = sheetSnaps(height, insets.top);
  const routeShown = mode === "route";
  const centreY = globeCentreY(routeShown, insets.top);
  const stopTop = sheetTop(routeShown ? STOP.route : STOP.rest, height, insets.top);
  // The labels' band: under the greeting (or the back button) and over the search bar (or the sheet).
  const backTop = insets.top + tokens.space.xs;
  const band = {
    top: insets.top + (routeShown ? BAND_TOP.route : BAND_TOP.rest),
    bottom: stopTop + (routeShown ? -tokens.space.xs : HOME_SHEET_HANDLE - tokens.space.xxs),
    avoid: routeShown
      ? [
          {
            left: tokens.space.gutter - tokens.space.xxs,
            top: backTop - tokens.space.xxs,
            right: tokens.space.gutter + BACK + tokens.space.xxs,
            bottom: backTop + BACK + tokens.space.xxs,
          },
        ]
      : [],
  };

  const footer = routeShown ? (
    <Button testID="explore.quote" label="Request a quote" variant="primary" trailing="chevron" onPress={openQuote} />
  ) : undefined;

  return (
    <View testID="explore.root" style={styles.root} onLayout={onLayout}>
      <ScreenStatusBar on={routeShown ? "dark" : "light"} />
      <SkyBackdrop />
      <Globe
        width={size.width}
        pins={pins}
        home={homeCoord}
        selected={state.to?.code ?? null}
        onSelect={onSelectPin}
        centreY={centreY}
        band={band}
        sheetTop={sheetTop(sheetIndex, height, insets.top)}
        paused={!focused || mode === "all"}
      />
      <SkyClouds centreY={globeCentreY(false, insets.top)} shown={!routeShown} />
      {routeShown ? (
        <BackButton
          testID="explore.back"
          variant="photo"
          onPress={clearDestination}
          style={StyleSheet.flatten([styles.back, { top: backTop }])}
        />
      ) : (
        <GreetingHeader
          name={firstName(profile?.displayName)}
          initials={monogram(profile?.displayName)}
          onProfile={() => router.push("/(tabs)/profile" as Href)}
          topInset={insets.top}
        />
      )}
      <HomeSheet index={sheetIndex} onChange={setSheetIndex} snapPoints={snaps} footer={footer} testID="explore.sheet">
        {routeShown ? (
          <DestinationDetails
            testIDPrefix="explore"
            state={state}
            offline={offline}
            onRetry={retrySearch}
            onOpenFare={(fare: FareVM) => router.push(fareHref(fare.id, fare.offerId))}
            onEditDates={() =>
              datesRef.current?.present({
                tripType: state.dates.depart && !state.dates.return ? "oneway" : "round",
                depart: state.dates.depart,
                ret: state.dates.return,
                editing: "depart",
              })
            }
            onEditCabin={() => cabinRef.current?.present(state.cabin)}
            onEditTravelers={() => travelersRef.current?.present(state.passengers)}
          />
        ) : homeError && !home ? (
          // A Home that did not load takes the place of what it would have shown; the search stays, and a route can still
          // be searched and asked for (ADR-IMPL-047).
          <View style={styles.rest}>
            {mode === "rest" ? (
              <SearchField
                testID="explore.search"
                tone="bar"
                placeholder="Where would you like to go?"
                onPress={() => router.push("/search" as Href)}
              />
            ) : null}
            <NoticeCard
              testID="explore.error"
              tone="error"
              title={homeError.title}
              body={homeError.body}
              link={{ label: "Try again", onPress: retryHome, testID: "explore.error.retry" }}
            />
          </View>
        ) : mode === "all" ? (
          <SheetExpanded
            home={home}
            onOpenOffer={(card) => void openOffer(card)}
            onDone={() => setSheetIndex(STOP.rest)}
            onSearch={() => router.push("/search" as Href)}
          />
        ) : (
          <View>
            <SearchField
              testID="explore.search"
              tone="bar"
              placeholder="Where would you like to go?"
              onPress={() => router.push("/search" as Href)}
            />
            <SheetRest
              home={home}
              homeLoading={homeLoading}
              onOpenOffer={(card) => void openOffer(card)}
              onSeeAll={() => setSheetIndex(STOP.all)}
              onSearch={() => router.push("/search" as Href)}
            />
          </View>
        )}
      </HomeSheet>
      <RequestSheet ref={requestRef} />
      <DatesSheet
        ref={datesRef}
        onFlexible={() => dispatch({ type: "setDates", dates: { depart: null, return: null, flexible: true } })}
        onUse={(sel) => {
          const dates = {
            depart: sel.depart,
            return: sel.tripType === "oneway" ? null : sel.ret,
            flexible: sel.depart === null,
          };
          dispatch({ type: "setDates", dates });
          if (state.to) rememberDates(state.to.code, { depart: dates.depart, return: dates.return });
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
  back: { position: "absolute", left: tokens.space.gutter },
  rest: { gap: tokens.space.lg },
});
