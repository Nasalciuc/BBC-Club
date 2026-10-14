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

import { airportSearchState } from "@/lib/airport-search-state";
import { fetchAirports, patchProfile, type Profile } from "@/lib/api";
import { stateCopy } from "@/lib/error-context";
import type { ProfileSheetHandle } from "./types";

export type { ProfileSheetHandle };

type Props = {
  profile: Profile;
  onSaved: (next: Profile) => void;
};

export const HomeAirportSheet = forwardRef<ProfileSheetHandle, Props>(function HomeAirportSheet(
  { profile, onSaved },
  ref,
) {
  const modalRef = useRef<ModalSheetHandle>(null);
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AirportVM | null>(null);
  const [search, setSearch] = useState(() => airportSearchState<AirportVM>("idle"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Under a long list of airports the error would sit behind the pinned button: each new one scrolls into view.
  const errorRef = useRef<Text>(null);
  useEffect(() => {
    if (error) modalRef.current?.reveal(errorRef.current);
  }, [error]);

  useImperativeHandle(ref, () => ({
    present() {
      setQuery(profile.homeAirport ?? "");
      setSelected(null);
      setSearch(airportSearchState("idle"));
      setBusy(false);
      setError(null);
      modalRef.current?.present();
    },
    dismiss() {
      modalRef.current?.dismiss();
    },
  }));

  useEffect(() => {
    if (query.trim().length < 2) {
      setSearch(airportSearchState("idle"));
      return;
    }
    setSearch(airportSearchState("loading"));
    const t = setTimeout(() => {
      void (async () => {
        const result = await fetchAirports(query);
        setSearch(airportSearchState(result));
      })();
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  async function onSave() {
    const code = (selected?.code ?? query.trim().toUpperCase()).slice(0, 3);
    if (code.length !== 3) {
      setError("Pick an airport or enter a 3-letter code.");
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
      <SearchField
        testID="profile.homeAirport.query"
        placeholder="City or code"
        editable
        value={query ? { text: query } : null}
        onChangeText={(text) => {
          setQuery(text);
          setSelected(null);
          setError(null);
        }}
        onClear={() => {
          setQuery("");
          setSelected(null);
        }}
      />

      {search.phase === "empty" && !selected ? (
        <EmptyState
          testID="profile.homeAirport.empty"
          title="No airports found"
          body="Try a city name or a three-letter airport code, such as JFK."
          primary={{
            label: "Clear search",
            onPress: () => {
              setQuery("");
              setSelected(null);
              setSearch(airportSearchState("idle"));
            },
          }}
        />
      ) : search.phase === "error" && !selected ? (
        <StateMessage
          testID="profile.homeAirport.error"
          variant="error"
          title={stateCopy("generic").title}
          body={stateCopy("generic").body}
          primary={{
            label: "Try again",
            onPress: () => {
              const q = query;
              setSearch(airportSearchState("loading"));
              void (async () => {
                const result = await fetchAirports(q);
                setSearch(airportSearchState(result));
              })();
            },
          }}
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
              onPress={() => {
                // The choice ends the typing: the keyboard goes, and the sheet shows its button again.
                Keyboard.dismiss();
                setSelected(a);
                setQuery(`${a.city} · ${a.code}`);
                setSearch(airportSearchState("idle"));
              }}
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
  // Figma 238:4561: the airport rows stand 8 pt apart.
  rows: { gap: tokens.space.xs },
  error: { ...rn(tokens.type.caption), color: tokens.colors.statusDanger },
});
