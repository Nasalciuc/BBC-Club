import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, CabinCard, ModalSheet, type ModalSheetHandle, tokens, rn } from "@bbc/ui";

import { putTravelPreferences, type Profile } from "@/lib/api";
import type { ProfileSheetHandle } from "./types";

type Props = {
  profile: Profile;
  onSaved: (next: Profile) => void;
};

export const CabinSheet = forwardRef<ProfileSheetHandle, Props>(function CabinSheet({ profile, onSaved }, ref) {
  const modalRef = useRef<ModalSheetHandle>(null);
  const insets = useSafeAreaInsets();
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
    // No image of its own: what the choice means, then onboarding's two cabin cards side by side (01).
    <ModalSheet
      ref={modalRef}
      title="Preferred cabin"
      closeTestID="profile.cabin.close"
      testID="profile.cabin.sheet"
      dismissible={!busy}
      insets={insets}
      footer={
        <Button
          testID="profile.cabin.save"
          label={busy ? "Saving…" : "Save cabin"}
          variant="primary"
          busy={busy}
          onPress={() => void onSave()}
        />
      }
    >
      <Text style={styles.help}>Your starting preference. You can choose a different cabin for any request.</Text>
      <View style={styles.cabins}>
        <CabinCard
          testID="profile.cabin.business"
          icon="seat"
          title="Business"
          line="More space, a better journey"
          selected={cabin === "business"}
          onPress={() => setCabin("business")}
        />
        <CabinCard
          testID="profile.cabin.first"
          icon="seat-first"
          title="First"
          line="The highest level of comfort"
          selected={cabin === "first"}
          onPress={() => setCabin("first")}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ModalSheet>
  );
});

const styles = StyleSheet.create({
  help: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
  // 01: the two cards 7.7 pt apart.
  cabins: { flexDirection: "row", gap: 7.7 },
  error: { ...rn(tokens.type.caption), color: tokens.colors.statusDangerText },
});
