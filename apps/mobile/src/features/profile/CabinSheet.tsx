import { BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, Chip, CloseButton, tokens, rn } from "@bbc/ui";

import { putTravelPreferences, type Profile } from "@/lib/api";
import type { ProfileSheetHandle } from "./types";

type Props = {
  profile: Profile;
  onSaved: (next: Profile) => void;
};

const SNAP = ["50%"] as const;

export const CabinSheet = forwardRef<ProfileSheetHandle, Props>(function CabinSheet({ profile, onSaved }, ref) {
  const modalRef = useRef<BottomSheetModal>(null);
  const [cabin, setCabin] = useState<"business" | "first">("business");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    present() {
      setCabin(profile.preferences?.cabin === "first" ? "first" : "business");
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
    const result = await putTravelPreferences({ cabin });
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
      <BottomSheetScrollView contentContainerStyle={styles.content} testID="profile.cabin.sheet">
        <View style={styles.header}>
          <Text style={styles.title}>Cabin</Text>
          <CloseButton testID="profile.cabin.close" onPress={() => modalRef.current?.dismiss()} />
        </View>

        <View style={styles.chips}>
          <Chip
            testID="profile.cabin.business"
            label="Business"
            selected={cabin === "business"}
            onPress={() => setCabin("business")}
          />
          <Chip
            testID="profile.cabin.first"
            label="First"
            selected={cabin === "first"}
            onPress={() => setCabin("first")}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          testID="profile.cabin.save"
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
  content: { paddingHorizontal: tokens.space.lg, paddingBottom: tokens.space.xxl, gap: tokens.space.md },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { ...rn(tokens.type.title), color: tokens.colors.textPrimary },
  chips: { flexDirection: "row", gap: tokens.space.xs },
  error: { ...rn(tokens.type.caption), color: tokens.colors.statusDanger },
});
