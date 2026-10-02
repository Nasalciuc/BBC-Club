import { BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, CloseButton, Stepper, tokens, rn } from "@bbc/ui";

import { putTravelPreferences, type Profile } from "@/lib/api";
import type { ProfileSheetHandle } from "./types";

type Props = {
  profile: Profile;
  onSaved: (next: Profile) => void;
};

const SNAP = ["55%"] as const;

export const TravelersSheet = forwardRef<ProfileSheetHandle, Props>(function TravelersSheet({ profile, onSaved }, ref) {
  const modalRef = useRef<BottomSheetModal>(null);
  const [adult, setAdult] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    present() {
      const p = profile.preferences?.passengers;
      setAdult(p?.adult ?? 1);
      setBusy(false);
      setError(null);
      modalRef.current?.present();
    },
    dismiss() {
      modalRef.current?.dismiss();
    },
  }));

  async function onSave() {
    setBusy(true);
    setError(null);
    const result = await putTravelPreferences({
      passengers: { adult, child: 0, infant: 0 },
    });
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
      backgroundStyle={styles.bg}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetScrollView contentContainerStyle={styles.content} testID="profile.travelers.sheet">
        <View style={styles.header}>
          <Text style={styles.title}>Travelers</Text>
          <CloseButton testID="profile.travelers.close" onPress={() => modalRef.current?.dismiss()} />
        </View>

        <Stepper testID="profile.travelers.adult" label="Adults" value={adult} min={1} max={9} onChange={setAdult} />
        <Text style={styles.caption}>For children or larger parties, add a note to your request.</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          testID="profile.travelers.save"
          label={busy ? "Saving…" : "Save"}
          busy={busy}
          shape="pill"
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
  caption: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary },
  error: { ...rn(tokens.type.caption), color: tokens.colors.statusDanger },
});
