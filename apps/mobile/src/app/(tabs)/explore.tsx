import { type Href, useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { BackHandler, type LayoutChangeEvent, Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AirportVM, FareVM } from "@bbc/shared/api/v1/fares";
import type { ProposalCardVM } from "@bbc/shared/api/v1/proposals";
import {
  BackButton,
  Button,
  HOME_SHEET_HANDLE,
  HOME_SHEET_PILL,
  HomeSheet,
  NoticeCard,
  RoundButton,
  SearchField,
  tokens,
} from "@bbc/ui";

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
import { SheetDone, SheetExpanded } from "@/features/explore/SheetExpanded";
import { SheetRest } from "@/features/explore/SheetRest";
import { SkyBackdrop, SkyClouds } from "@/features/explore/SkyBackdrop";
import { useExploreHome } from "@/features/explore/useExploreHome";
import { useOffline } from "@/features/explore/useOffline";
import { Globe } from "@/features/globe/Globe";
import { useDestinations } from "@/features/globe/useDestinations";
import { DatesPage, type DatesPageHandle } from "@/features/requests/DatesPage";
import { toggleSaved, useIsSaved } from "@/features/saved/saved";
import type { SearchContext } from "@/features/requests/useRequestDraft";
import { useSearch } from "@/features/search/useSearch";
import { fetchProfile, type Profile } from "@/lib/api";
import { monogram } from "@/lib/monogram";

/** The sheet's stops: at rest (02), a chosen route (13), every offer (16). */
const STOP = { rest: 0, route: 1, all: 2 } as const;
/** 02: the labels stay under the greeting; 13: under the status bar, clear of the round buttons. */
const BAND_TOP = { rest: 76, route: 8 } as const;
/**
 * 13: the round buttons over a chosen route — back 36 across, 14.7 from the left; the bookmark 35.5, 15.2 from the
 * right — their tops 3.7 above the status bar's foot; the chevron 24 at 1.6, the bookmark 16.5 at 2.2.
 */
const ROUND = { top: -3.7, back: { size: 36, left: 14.7 }, save: { size: 35.5, right: 15.2 } } as const;
/** 13: `Request a quote`'s words 0.83 lower than centred in their pill. */
const QUOTE_WORDS_DROP = 0.83;

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
  const datesRef = useRef<DatesPageHandle>(null);
  const cabinRef = useRef<CabinSheetHandle>(null);
  const travelersRef = useRef<TravelersSheetHandle>(null);
  const [size, setSize] = useState({ width: screen.width, height: screen.height });
  const height = size.height;
  // `See all ›` under 08's `Other great fares` comes back to Explore with every offer raised (16): a fresh Explore
  // opens raised, one already open beneath raises its sheet.
  const { offers: offersParam } = useLocalSearchParams<{ offers?: string }>();
  const [sheetIndex, setSheetIndex] = useState<number>(() => (offersParam === "all" ? STOP.all : STOP.rest));
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

  // The destination chosen on the globe comes with the dates it was last searched for, as from Search's recent list
  // (03, 04): Search and the globe keep one list.
  function selectDestination(airport: AirportVM) {
    const dates = rememberSearch(airport)[0]?.dates;
    dispatch({ type: "selectDestination", airport });
    if (dates?.depart) {
      dispatch({ type: "setDates", dates: { depart: dates.depart, return: dates.return, flexible: false } });
    }
    setChoices((n) => n + 1);
  }

  function clearDestination() {
    dispatch({ type: "clearDestination" });
    setSheetIndex(STOP.rest);
  }

  useEffect(() => {
    if (offersParam !== "all") return;
    dispatch({ type: "clearDestination" });
    setSheetIndex(STOP.all);
    router.setParams({ offers: undefined });
  }, [offersParam]);

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

  const saved = useIsSaved("destination", state.to?.code);
  const snaps = sheetSnaps(height, insets.top);
  const routeShown = mode === "route";
  const centreY = globeCentreY(routeShown, insets.top);
  const stopTop = sheetTop(routeShown ? STOP.route : STOP.rest, height, insets.top);
  // The labels' band: under the greeting (or the round buttons) and over the search bar (or the sheet).
  const roundTop = insets.top + ROUND.top;
  const pad = tokens.space.xxs;
  const band = {
    top: insets.top + (routeShown ? BAND_TOP.route : BAND_TOP.rest),
    bottom: stopTop + (routeShown ? -tokens.space.xs : HOME_SHEET_HANDLE - tokens.space.xxs),
    avoid: routeShown
      ? [
          {
            left: ROUND.back.left - pad,
            top: roundTop - pad,
            right: ROUND.back.left + ROUND.back.size + pad,
            bottom: roundTop + ROUND.back.size + pad,
          },
          {
            left: size.width - ROUND.save.right - ROUND.save.size - pad,
            top: roundTop - pad,
            right: size.width - ROUND.save.right + pad,
            bottom: roundTop + ROUND.save.size + pad,
          },
        ]
      : [],
  };

  // 13: the words centred, the chevron 4.7 after them — 18.4 at 1.8.
  const footer = routeShown ? (
    <Button
      testID="explore.quote"
      label="Request a quote"
      variant="primary"
      height={HOME_SHEET_PILL}
      text="buttonRoute"
      trailing="chevron"
      trailingSize={18.4}
      trailingGap={4.73}
      centreWords
      style={{ paddingTop: 2 * QUOTE_WORDS_DROP }}
      onPress={openQuote}
    />
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
        <>
          <BackButton
            testID="explore.back"
            variant="photo"
            diameter={ROUND.back.size}
            glyph={{ size: 24, stroke: 1.6 }}
            onPress={clearDestination}
            style={StyleSheet.flatten([styles.round, { top: roundTop, left: ROUND.back.left }])}
          />
          {state.to ? (
            <RoundButton
              testID="explore.save"
              icon="bookmark"
              selectedIcon="bookmark-fill"
              selected={saved}
              accessibilityLabel={saved ? `Saved: ${state.to.city}` : `Save ${state.to.city}`}
              diameter={ROUND.save.size}
              iconSize={16.5}
              strokeWidth={2.2}
              onPress={() => {
                if (state.to) toggleSaved("destination", state.to.code);
              }}
              style={StyleSheet.flatten([styles.round, { top: roundTop, right: ROUND.save.right }])}
            />
          ) : null}
        </>
      ) : (
        <GreetingHeader
          name={firstName(profile?.displayName)}
          initials={monogram(profile?.displayName)}
          portrait={profile?.avatarUrl ? { uri: profile.avatarUrl } : null}
          onProfile={() => router.push("/(tabs)/profile" as Href)}
          topInset={insets.top}
        />
      )}
      <HomeSheet
        index={sheetIndex}
        onChange={setSheetIndex}
        snapPoints={snaps}
        footer={footer}
        accessory={mode === "all" ? <SheetDone onDone={() => setSheetIndex(STOP.rest)} /> : undefined}
        testID="explore.sheet"
      >
        {routeShown ? (
          <DestinationDetails
            look="route"
            testIDPrefix="explore"
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
                  toCity: state.to?.city,
                  toCode: state.to?.code,
                  flexible: state.dates.flexible,
                },
              )
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
            onSearch={() => router.push("/search" as Href)}
          />
        ) : (
          <View>
            <View style={styles.bar}>
              <SearchField
                testID="explore.search"
                tone="bar"
                placeholder="Where would you like to go?"
                onPress={() => router.push("/search" as Href)}
              />
            </View>
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
  round: { position: "absolute" },
  // 02: the bar 18.6 from the left and 18.7 from the right, a little inside the sheet's gutter.
  bar: { marginLeft: 18.6 - tokens.space.gutter, marginRight: 18.7 - tokens.space.gutter },
  rest: { gap: tokens.space.lg },
});
