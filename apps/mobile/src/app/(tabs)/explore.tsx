import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AirportVM } from "@bbc/shared/api/v1/fares";
import type { ProposalCardVM } from "@bbc/shared/api/v1/proposals";
import { ErrorState, HomeSheet, SearchField, tokens } from "@bbc/ui";

import { RequestSheet, type RequestSheetHandle } from "@/components/RequestSheet";
import { OfflineBanner } from "@/features/explore/OfflineBanner";
import { cheapestFareOnRoute, fareHref } from "@/features/explore/open-offer";
import { SheetExpanded } from "@/features/explore/SheetExpanded";
import { SheetRest, useExploreHome } from "@/features/explore/SheetRest";
import { SheetSelected } from "@/features/explore/SheetSelected";
import { rememberAirport } from "@/features/explore/recent-airports";
import { SheetTyping } from "@/features/explore/SheetTyping";
import { Globe } from "@/features/globe/Globe";
import { useDestinations } from "@/features/globe/useDestinations";
import { useSearch } from "@/features/search/useSearch";
import { fetchProfile, type Profile } from "@/lib/api";

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const requestRef = useRef<RequestSheetHandle>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [offline, setOffline] = useState(false);
  const [pickingAirport, setPickingAirport] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const { home, homeLoading, homeError, defaultFrom, retryHome } = useExploreHome();
  const { state, dispatch, retry } = useSearch({ defaultFrom });
  const { pins, homeCoord, pinToAirport } = useDestinations(home, state.to);

  useEffect(() => {
    void (async () => {
      const result = await fetchProfile();
      if (result.ok) setProfile(result.data);
    })();
  }, []);

  useEffect(() => {
    if (state.to && sheetIndex < 1) setSheetIndex(1);
  }, [state.to, sheetIndex]);

  function selectDestination(airport: AirportVM) {
    rememberAirport(airport);
    dispatch({ type: "selectDestination", airport });
    setPickingAirport(false);
    setSheetIndex(1);
  }

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

  function openQuote() {
    requestRef.current?.present({
      fare: null,
      profile,
      fromCode: state.from?.code,
      toCode: state.to?.code,
      city: state.to?.city,
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
    });
  }

  const searchValue = state.to
    ? { prefix: `${state.from?.code ?? "JFK"} → `, text: `${state.to.city} · ${state.to.code}` }
    : null;

  return (
    <View testID="explore.root" style={styles.root}>
      {/* The globe first: Mapbox draws an opaque map, so the banner must sit above it. */}
      <Globe
        pins={pins}
        home={homeCoord}
        selected={state.to?.code ?? null}
        onSelect={onSelectPin}
        state={state.to ? "selected" : "rest"}
        sheetIndex={sheetIndex}
        hidden={sheetIndex >= 2}
      />
      <OfflineBanner topInset={insets.top} onOfflineChange={setOffline} />
      <HomeSheet index={sheetIndex} onChange={setSheetIndex}>
        {homeError ? (
          <ErrorState
            variant="error"
            title="Something went wrong."
            body={homeError}
            primary={{ label: "Try again", onPress: retryHome }}
            testID="explore.error"
          />
        ) : (
          <>
            {pickingAirport ? (
              <SheetTyping suggestions={suggestions} onSelect={selectDestination} />
            ) : (
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
            )}
            {state.to && !pickingAirport ? (
              <SheetSelected state={state} dispatch={dispatch} onRetry={retry} onQuote={openQuote} />
            ) : null}
            {!state.to && !pickingAirport ? (
              <SheetRest home={home} homeLoading={homeLoading} onOpenOffer={(card) => void openOffer(card)} />
            ) : null}
            {sheetIndex === 2 && !pickingAirport && !state.to ? (
              <SheetExpanded sections={home?.sections ?? []} onOpenOffer={(card) => void openOffer(card)} />
            ) : null}
            {homeLoading && !home ? (
              <ActivityIndicator color={tokens.colors.primary} style={{ marginTop: tokens.space.lg }} />
            ) : null}
          </>
        )}
      </HomeSheet>
      <RequestSheet ref={requestRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Figma P3.1 / P3.2: the night page behind the globe.
  root: { flex: 1, backgroundColor: tokens.colors.surfaceNight },
});
