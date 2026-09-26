import { BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AirportRow, Button, CloseButton, SearchField, tokens, rn } from "@bbc/ui";
import type { AirportVM } from "@bbc/shared/api/v1/fares";

import { fetchAirports, patchProfile, type Profile } from "@/lib/api";
import type { ProfileSheetHandle } from "./types";

export type { ProfileSheetHandle };

type Props = {
  profile: Profile;
  onSaved: (next: Profile) => void;
};

const SNAP = ["75%"] as const;

export const HomeAirportSheet = forwardRef<ProfileSheetHandle, Props>(function HomeAirportSheet(
  { profile, onSaved },
  ref,
) {
  const modalRef = useRef<BottomSheetModal>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AirportVM | null>(null);
  const [hits, setHits] = useState<AirportVM[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    present() {
      setQuery(profile.homeAirport ?? "");
      setSelected(null);
      setHits([]);
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
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        const result = await fetchAirports(query);
        if (result.ok) setHits(result.data);
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
    <BottomSheetModal
      ref={modalRef}
      snapPoints={[...SNAP]}
      enablePanDownToClose={!busy}
      keyboardBehavior="interactive"
      backgroundStyle={styles.bg}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetScrollView contentContainerStyle={styles.content} testID="profile.homeAirport.sheet">
        <View style={styles.header}>
          <Text style={styles.title}>Home airport</Text>
          <CloseButton testID="profile.homeAirport.close" onPress={() => modalRef.current?.dismiss()} />
        </View>

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

        {hits.map((a) => (
          <AirportRow
            key={a.code}
            testID={`profile.homeAirport.hit.${a.code}`}
            code={a.code}
            city={a.city}
            airport={a.name}
            countryCode={a.countryCode}
            onPress={() => {
              setSelected(a);
              setQuery(`${a.city} · ${a.code}`);
              setHits([]);
            }}
          />
        ))}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          testID="profile.homeAirport.save"
          label={busy ? "Saving…" : "Save"}
          busy={busy}
          shape="card"
          onPress={() => void onSave()}
        />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  bg: {
    backgroundColor: tokens.colors.surfacePage,
    borderTopLeftRadius: tokens.radius.panel,
    borderTopRightRadius: tokens.radius.panel,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: tokens.colors.borderDefault },
  content: { paddingHorizontal: tokens.space.lg, paddingBottom: tokens.space.xxl, gap: tokens.space.sm },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { ...rn(tokens.type.title), color: tokens.colors.textPrimary },
  error: { ...rn(tokens.type.caption), color: tokens.colors.statusDanger },
});
