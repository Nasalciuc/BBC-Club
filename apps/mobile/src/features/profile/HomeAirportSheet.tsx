import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Keyboard, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AirportRow,
  Button,
  EmptyState,
  ModalSheet,
  type ModalSheetHandle,
  SearchField,
  StateMessage,
  tokens,
  rn,
} from "@bbc/ui";
import type { AirportVM } from "@bbc/shared/api/v1/fares";

import { deviceTimeZone } from "@/features/explore/discovery-logic";
import { airportByCode } from "@/lib/airport-by-code";
import { airportSearchState, homeAirportLabel, wantsAirportSearch } from "@/lib/airport-search-state";
import { fetchAirports, fetchHomeSuggestion, patchProfile, type Profile } from "@/lib/api";
import { stateCopy } from "@/lib/error-context";
import type { ProfileSheetHandle } from "./types";

export type { ProfileSheetHandle };

type Props = {
  profile: Profile;
  /** The city of the member's home airport, once known (`JFK · New York`). */
  homeCity: string | null;
  onSaved: (next: Profile) => void;
};

/**
 * Figma 238:4561: the airport the member flies from — what it is now under an empty search, and the airports to choose
 * from under it. With nothing typed, the airport of the phone's time zone is offered (A5, ADR-IMPL-039) where Figma
 * draws four.
 */
export const HomeAirportSheet = forwardRef<ProfileSheetHandle, Props>(function HomeAirportSheet(
  { profile, homeCity, onSaved },
  ref,
) {
  const modalRef = useRef<ModalSheetHandle>(null);
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  // The airport the sheet will save: the member's own until they choose another.
  const [chosen, setChosen] = useState<{ code: string; city: string | null } | null>(null);
  const [suggested, setSuggested] = useState<AirportVM | null>(null);
  const [search, setSearch] = useState(() => airportSearchState<AirportVM>("idle"));
  // `Try again` runs the search effect once more: its answer is dropped like any other if the member has typed on or
  // chosen by the time it comes.
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Under a long list of airports the error would sit behind the pinned button: each new one scrolls into view.
  const errorRef = useRef<Text>(null);
  useEffect(() => {
    if (error) modalRef.current?.reveal(errorRef.current);
  }, [error]);

  useImperativeHandle(ref, () => ({
    present() {
      setQuery("");
      setChosen(null);
      setSearch(airportSearchState("idle"));
      setBusy(false);
      setError(null);
      modalRef.current?.present();
      void suggest();
    },
    dismiss() {
      modalRef.current?.dismiss();
    },
  }));

  // ADR-IMPL-039: the busiest airport in the phone's time zone — offered, never chosen for the member.
  async function suggest() {
    const tz = deviceTimeZone();
    if (!tz || suggested) return;
    const result = await fetchHomeSuggestion(tz);
    if (result.ok) setSuggested(result.data.airport);
  }

  useEffect(() => {
    if (!wantsAirportSearch(query, null)) {
      setSearch(airportSearchState("idle"));
      return;
    }
    setSearch(airportSearchState("loading"));
    // An answer still on its way when the member types on, or chooses, is dropped: it would reopen the list.
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        const result = await fetchAirports(query);
        if (!cancelled) setSearch(airportSearchState(result));
      })();
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, attempt]);

  function choose(airport: AirportVM) {
    // While a save runs (its lookup of a typed code, then the request), the choice stands still: what the sheet
    // saves is what it shows when `Save airport` was tapped.
    if (busy) return;
    // The choice ends the typing: the keyboard goes, the field empties, and the line under it names the choice.
    Keyboard.dismiss();
    setChosen({ code: airport.code, city: airport.city });
    setQuery("");
    setSearch(airportSearchState("idle"));
    setError(null);
  }

  async function onSave() {
    // The airport chosen from the list, else the member's own. Words still in the field were never chosen: a whole
    // code the catalog knows is taken as the choice (typed `LHR`, no row tapped); a city or a fragment is not an
    // airport, and the one chosen under it is not saved over it unseen.
    const typed = query.trim().toUpperCase();
    let code = chosen?.code ?? profile.homeAirport ?? null;
    if (typed) {
      setBusy(true);
      const airport = await airportByCode(typed);
      setBusy(false);
      if (!airport) {
        setError("Choose an airport from the list.");
        return;
      }
      code = airport.code;
    }
    if (!code) {
      setError("Choose your home airport.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await patchProfile({ homeAirport: code });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onSaved(result.data);
    modalRef.current?.dismiss();
  }

  const current = chosen ?? (profile.homeAirport ? { code: profile.homeAirport, city: homeCity } : null);
  const typing = query.trim().length >= 2;

  return (
    <ModalSheet
      ref={modalRef}
      title="Home airport"
      closeTestID="profile.homeAirport.close"
      testID="profile.homeAirport.sheet"
      dismissible={!busy}
      insets={insets}
      footer={
        <Button
          testID="profile.homeAirport.save"
          label={busy ? "Saving…" : "Save airport"}
          variant="primary"
          busy={busy}
          onPress={() => void onSave()}
        />
      }
    >
      <Text style={styles.help}>The airport you usually fly from.</Text>

      <SearchField
        testID="profile.homeAirport.query"
        placeholder="City or airport"
        editable
        value={query ? { text: query } : null}
        onChangeText={(text) => {
          if (busy) return;
          setQuery(text);
          setError(null);
        }}
        onClear={() => {
          if (!busy) setQuery("");
        }}
      />

      {current ? (
        <Text testID="profile.homeAirport.current" style={styles.current}>
          {homeAirportLabel(current.code, current.city)}
        </Text>
      ) : null}

      {!typing ? (
        suggested ? (
          <AirportRow
            testID={`profile.homeAirport.suggested.${suggested.code}`}
            code={suggested.code}
            city={suggested.city}
            airport={suggested.name}
            onPress={() => choose(suggested)}
          />
        ) : null
      ) : search.phase === "empty" ? (
        <EmptyState
          testID="profile.homeAirport.empty"
          title="No airports found"
          body="Try a city name or a three-letter airport code, such as JFK."
          primary={{ label: "Clear search", onPress: () => setQuery("") }}
        />
      ) : search.phase === "error" ? (
        <StateMessage
          testID="profile.homeAirport.error"
          variant="error"
          title={stateCopy("generic").title}
          body={stateCopy("generic").body}
          primary={{ label: "Try again", onPress: () => setAttempt((n) => n + 1) }}
        />
      ) : search.airports.length > 0 ? (
        <View style={styles.rows}>
          {search.airports.map((a) => (
            <AirportRow
              key={a.code}
              testID={`profile.homeAirport.hit.${a.code}`}
              code={a.code}
              city={a.city}
              airport={a.name}
              onPress={() => choose(a)}
            />
          ))}
        </View>
      ) : null}

      {error ? (
        <Text ref={errorRef} style={styles.error}>
          {error}
        </Text>
      ) : null}
    </ModalSheet>
  );
});

const styles = StyleSheet.create({
  help: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  current: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
  // Figma 238:4682: the airport rows stand 8 pt apart.
  rows: { gap: tokens.space.xs },
  // A message is `text-secondary`, never `status-danger` (DESIGN.md: that is for a field at fault only).
  error: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
});
