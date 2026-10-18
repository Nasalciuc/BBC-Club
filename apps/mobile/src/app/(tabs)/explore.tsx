import { type Href, useIsFocused, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Keyboard, Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AirportVM } from "@bbc/shared/api/v1/fares";
import type { ProposalCardVM } from "@bbc/shared/api/v1/proposals";
import { Button, ErrorState, HomeSheet, SearchField, tokens } from "@bbc/ui";

import { RequestSheet, type RequestSheetHandle } from "@/components/RequestSheet";
import { ScreenStatusBar } from "@/components/screen-status-bar";
import { ExploreHeader, type HeaderAction } from "@/features/explore/ExploreHeader";
import { cheapestFareOnRoute, fareHref } from "@/features/explore/open-offer";
import { rememberAirport } from "@/features/explore/recent-airports";
import {
  type CabinSheetHandle,
  SearchCabinSheet,
  SearchTravelersSheet,
  type TravelersSheetHandle,
} from "@/features/explore/SearchPreferenceSheets";
import { SheetExpanded } from "@/features/explore/SheetExpanded";
import { SheetRest, useExploreHome } from "@/features/explore/SheetRest";
import { wantsQuoteFooter } from "@/features/explore/quote-footer";
import { SheetSelected } from "@/features/explore/SheetSelected";
import { SheetTyping } from "@/features/explore/SheetTyping";
import { useOffline } from "@/features/explore/useOffline";
import { Globe } from "@/features/globe/Globe";
import { useDestinations } from "@/features/globe/useDestinations";
import { DatesSheet, type DatesSheetHandle } from "@/features/requests/DatesSheet";
import type { SearchContext } from "@/features/requests/useRequestDraft";
import { useSearch } from "@/features/search/useSearch";
import { fetchProfile, type Profile } from "@/lib/api";
import { monogram } from "@/lib/monogram";

/** The sheet's resting index per state (home-sheet-snaps: Figma's 300 / 544 / 656 pt). */
const SNAP = { rest: 0, selected: 1, page: 2 } as const;

type Mode = "rest" | "expanded" | "typing" | "selected";

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Another tab, or a fare or a request pushed over the tabs: the globe stays drawn but stops moving (ADR-IMPL-047).
  const focused = useIsFocused();
  const requestRef = useRef<RequestSheetHandle>(null);
  const datesRef = useRef<DatesSheetHandle>(null);
  const cabinRef = useRef<CabinSheetHandle>(null);
  const travelersRef = useRef<TravelersSheetHandle>(null);
  const [sheetIndex, setSheetIndex] = useState<number>(SNAP.rest);
  const [pickingAirport, setPickingAirport] = useState(false);
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

  const mode: Mode = pickingAirport ? "typing" : state.to ? "selected" : sheetIndex >= SNAP.page ? "expanded" : "rest";
  // Figma draws Typing, Expanded, Zero results and Offline on the light page without the globe (89:388–89:391);
  // Rest, a route with fares and the indicative fare keep the night page and the globe (89:386, 89:387, 536:10635).
  // Offline matters only when the route has nothing to show yet: fares already on screen stay (a connectivity blip
  // must not empty the sheet), and the offline state takes the place of the results.
  const hasContent =
    ((state.status === "done" || state.status === "paused") && state.results !== null) ||
    (state.status === "empty" && state.estimate !== null);
  const showOffline = offline && !hasContent;
  const emptyRoute = state.status === "error" || (state.status === "empty" && state.estimate === null);
  const routeOnPageNow = showOffline || emptyRoute;
  // While a new search runs the page stays where it was: no night ↔ porcelain bounce between two empty results.
  const [settledOnPage, setSettledOnPage] = useState(false);
  useEffect(() => {
    if (state.status !== "searching") setSettledOnPage(routeOnPageNow);
  }, [routeOnPageNow, state.status]);
  const routeOnPage = state.status === "searching" ? settledOnPage : routeOnPageNow;
  const selectedOnPage = mode === "selected" && routeOnPage;
  const light = mode === "typing" || mode === "expanded" || selectedOnPage;

  // The sheet follows the state; a drag still moves it (Rest ↔ Expanded is a drag or `See all` / `Done`). One owner
  // for the index on every state change — nothing else sets it while a route is chosen. Every choice of a destination
  // raises it again, the same city tapped twice included: a sheet the member dragged down would otherwise leave the
  // fares under the docked `Request a quote` (89:387 shows them above it).
  const target = mode === "typing" || selectedOnPage ? SNAP.page : mode === "selected" ? SNAP.selected : null;
  const [choices, setChoices] = useState(0);
  useEffect(() => {
    if (target !== null) setSheetIndex(target);
  }, [target, choices]);

  function selectDestination(airport: AirportVM) {
    Keyboard.dismiss();
    rememberAirport(airport);
    dispatch({ type: "selectDestination", airport });
    setPickingAirport(false);
    setChoices((n) => n + 1);
  }

  function cancelTyping() {
    Keyboard.dismiss();
    setPickingAirport(false);
    // Back to the state before typing: a chosen route keeps its sheet (the effect above owns it); none → Rest.
    if (!state.to) setSheetIndex(SNAP.rest);
  }

  // Android's Back undoes the sheet before it leaves Explore: typing ends as Cancel ends it, and an expanded sheet comes
  // back to rest as Done brings it (ADR-IMPL-047). A modal sheet over Explore registers later and answers first.
  useEffect(() => {
    if (Platform.OS !== "android" || !focused || (mode !== "typing" && mode !== "expanded")) return;
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      if (mode === "typing") cancelTyping();
      else setSheetIndex(SNAP.rest);
      return true;
    });
    return () => back.remove();
  }, [focused, mode]);

  const suggestions = (home?.destinations ?? []).map((d) => ({
    code: d.code,
    city: d.city,
    name: d.name,
    countryCode: d.countryCode,
    lat: d.lat,
    lng: d.lng,
  }));

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

  /** The field's tap, and `Search a destination` where there is no offer: the sheet up, the airports to type. */
  function openSearch() {
    setPickingAirport(true);
    setSheetIndex(SNAP.page);
  }

  function openQuote() {
    requestRef.current?.present({
      fare: null,
      profile,
      fromCode: state.from?.code,
      toCode: state.to?.code,
      fromCity: state.from?.city,
      city: state.to?.city,
      search,
      // The indicative fare is on screen only for an undated search with no published fare (536:10635): only then does
      // the quote say the member saw it — the server recomputes the number (ADR-IMPL-042).
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
      city: suggestions.find((d) => d.code === card.route.to)?.city,
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

  const headerAction: HeaderAction =
    mode === "typing"
      ? { kind: "cancel", onPress: cancelTyping }
      : mode === "expanded"
        ? { kind: "done", onPress: () => setSheetIndex(SNAP.rest) }
        : {
            kind: "profile",
            initials: monogram(profile?.displayName),
            onPress: () => router.push("/(tabs)/profile" as Href),
          };

  const searchValue = state.to
    ? { prefix: `${state.from?.code ?? "JFK"} → `, text: `${state.to.city} · ${state.to.code}` }
    : null;

  const footer =
    mode === "selected" && wantsQuoteFooter(state, showOffline) ? (
      <Button testID="explore.quote" label="Request a quote" variant="primary" onPress={openQuote} />
    ) : undefined;

  return (
    <View testID="explore.root" style={[styles.root, light ? styles.page : styles.night]}>
      <ScreenStatusBar on={light ? "light" : "dark"} />
      {/* The globe first: Mapbox draws an opaque map, so the header must sit above it. */}
      <Globe
        pins={pins}
        home={homeCoord}
        selected={state.to?.code ?? null}
        onSelect={onSelectPin}
        state={state.to ? "selected" : "rest"}
        sheetIndex={sheetIndex}
        hidden={light}
        paused={!focused}
      />
      <ExploreHeader tone={light ? "light" : "dark"} action={headerAction} topInset={insets.top} />
      <HomeSheet index={sheetIndex} onChange={setSheetIndex} footer={footer} page={selectedOnPage}>
        {pickingAirport ? (
          <SheetTyping from={state.from} suggestions={suggestions} onSelect={selectDestination} />
        ) : (
          <SearchField
            testID="explore.search"
            placeholder="Where would you like to go?"
            value={searchValue}
            onPress={openSearch}
            onClear={() => {
              dispatch({ type: "clearDestination" });
              setSheetIndex(SNAP.rest);
            }}
          />
        )}
        {mode === "selected" ? (
          <SheetSelected
            state={state}
            offline={showOffline}
            onRetry={retrySearch}
            onQuote={openQuote}
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
        ) : null}
        {/* A Home that did not load takes the place of what it would have shown — the search stays above it, and a
            route can still be searched and asked for (ADR-IMPL-047). While it loads, SheetRest draws its own cards; the
            full sheet, which has none, a spinner — never "No offers yet." before Home has answered. */}
        {homeError && !home && (mode === "rest" || mode === "expanded") ? (
          <ErrorState
            variant="error"
            title={homeError.title}
            body={homeError.body}
            primary={{ label: "Try again", onPress: retryHome }}
            testID="explore.error"
          />
        ) : mode === "rest" ? (
          <SheetRest
            home={home}
            homeLoading={homeLoading}
            onOpenOffer={(card) => void openOffer(card)}
            onSeeAll={() => setSheetIndex(SNAP.page)}
            onSearch={openSearch}
          />
        ) : mode === "expanded" && homeLoading && !home ? (
          <ActivityIndicator color={tokens.colors.primary} style={{ marginTop: tokens.space.lg }} />
        ) : mode === "expanded" ? (
          <SheetExpanded
            sections={home?.sections ?? []}
            onOpenOffer={(card) => void openOffer(card)}
            onSearch={openSearch}
          />
        ) : null}
      </HomeSheet>
      <RequestSheet ref={requestRef} />
      <DatesSheet
        ref={datesRef}
        onFlexible={() => dispatch({ type: "setDates", dates: { depart: null, return: null, flexible: true } })}
        onUse={(sel) =>
          dispatch({
            type: "setDates",
            dates: {
              depart: sel.depart,
              return: sel.tripType === "oneway" ? null : sel.ret,
              flexible: sel.depart === null,
            },
          })
        }
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
  root: { flex: 1 },
  // Figma P3.1 / P3.2: the night page behind the globe.
  night: { backgroundColor: tokens.colors.surfaceNight },
  // Figma P3.3–P3.6: the porcelain page once the sheet fills the screen.
  page: { backgroundColor: tokens.colors.surfacePage },
});
