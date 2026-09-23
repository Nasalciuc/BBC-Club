import { BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Icon, Stepper, tokens, rn } from "@bbc/ui";

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
  const [child, setChild] = useState(0);
  const [infant, setInfant] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    present() {
      const p = profile.preferences?.passengers;
      setAdult(p?.adult ?? 1);
      setChild(p?.child ?? 0);
      setInfant(p?.infant ?? 0);
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
      passengers: { adult, child, infant },
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
          <Pressable
            testID="profile.travelers.close"
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
            onPress={() => modalRef.current?.dismiss()}
          >
            <Icon name="clear" size={20} />
          </Pressable>
        </View>

        <Stepper testID="profile.travelers.adult" label="Adults" value={adult} min={1} max={9} onChange={setAdult} />
        <Stepper testID="profile.travelers.child" label="Children" value={child} min={0} max={8} onChange={setChild} />
        <Stepper
          testID="profile.travelers.infant"
          label="Infants"
          value={infant}
          min={0}
          max={4}
          onChange={setInfant}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          testID="profile.travelers.save"
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
