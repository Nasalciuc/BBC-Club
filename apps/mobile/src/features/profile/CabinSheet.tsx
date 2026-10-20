import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Chip, ModalSheet, type ModalSheetHandle, tokens, rn } from "@bbc/ui";

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
    // Figma 238:4710: what the choice means, then the two cabins one under the other, 56 pt each, 24 apart.
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
      <Chip
        testID="profile.cabin.business"
        label="Business"
        size="lg"
        selected={cabin === "business"}
        onPress={() => setCabin("business")}
      />
      <Chip
        testID="profile.cabin.first"
        label="First"
        size="lg"
        selected={cabin === "first"}
        onPress={() => setCabin("first")}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ModalSheet>
  );
});

const styles = StyleSheet.create({
  help: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
  error: { ...rn(tokens.type.caption), color: tokens.colors.statusDangerText },
});
