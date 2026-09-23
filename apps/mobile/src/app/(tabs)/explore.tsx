import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AirportVM } from "@bbc/shared/api/v1/fares";
import { ErrorState, GlobeFallback, HomeSheet, SearchField, tokens } from "@bbc/ui";

import { OfflineBanner } from "@/features/explore/OfflineBanner";
import { SheetExpanded } from "@/features/explore/SheetExpanded";
import { SheetRest, useExploreHome } from "@/features/explore/SheetRest";
import { SheetSelected } from "@/features/explore/SheetSelected";
import { SheetTyping } from "@/features/explore/SheetTyping";
import { useDestinations } from "@/features/globe/useDestinations";
import { useSearch } from "@/features/search/useSearch";

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const [sheetIndex, setSheetIndex] = useState(0);
  const [offline, setOffline] = useState(false);
  const [pickingAirport, setPickingAirport] = useState(false);
  const { home, homeLoading, homeError, defaultFrom, retryHome } = useExploreHome();
  const { state, dispatch } = useSearch({ defaultFrom });
  const { pins, homeCoord, pinToAirport } = useDestinations(home, state.to?.code ?? null);

  useEffect(() => {
    if (state.to && sheetIndex < 1) setSheetIndex(1);
  }, [state.to, sheetIndex]);

  function selectDestination(airport: AirportVM) {
    dispatch({ type: "selectDestination", airport });
    setPickingAirport(false);
    setSheetIndex(1);
  }

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

  const searchValue = state.to
    ? { prefix: `${state.from?.code ?? "JFK"} → `, text: `${state.to.city} · ${state.to.code}` }
    : null;

  return (
    <View testID="explore.root" style={styles.root}>
      <OfflineBanner topInset={insets.top} onOfflineChange={setOffline} />
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
            primary={{ label: "Try again", onPress: retryHome }}
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
            {pickingAirport ? <SheetTyping onSelect={selectDestination} /> : null}
            {state.to && !pickingAirport ? (
              <SheetSelected state={state} dispatch={dispatch} onRetry={retryHome} />
            ) : null}
            {!state.to && !pickingAirport ? <SheetRest home={home} homeLoading={homeLoading} /> : null}
            {sheetIndex === 2 && !pickingAirport && !state.to ? (
              <SheetExpanded sections={home?.sections ?? []} />
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
  globeWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 520,
    alignItems: "center",
    justifyContent: "center",
  },
});
