import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, ModalSheet, type ModalSheetHandle, Stepper, tokens, rn } from "@bbc/ui";

import { withAdults } from "@/features/explore/travel-preferences";
import { putTravelPreferences, type Profile } from "@/lib/api";
import type { ProfileSheetHandle } from "./types";

type Props = {
  profile: Profile;
  onSaved: (next: Profile) => void;
};

export const TravelersSheet = forwardRef<ProfileSheetHandle, Props>(function TravelersSheet({ profile, onSaved }, ref) {
  const modalRef = useRef<ModalSheetHandle>(null);
  const insets = useSafeAreaInsets();
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
    // Adults only here: children and infants already in the profile stay.
    const result = await putTravelPreferences({
      passengers: withAdults(profile.preferences?.passengers, adult),
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
    <ModalSheet
      ref={modalRef}
      title="Travelers"
      closeTestID="profile.travelers.close"
      testID="profile.travelers.sheet"
      dismissible={!busy}
      insets={insets}
      footer={
        <Button
          testID="profile.travelers.save"
          label={busy ? "Saving…" : "Save travelers"}
          variant="primary"
          busy={busy}
          onPress={() => void onSave()}
        />
      }
    >
      {/* Figma 238:4842: what the number is for, the stepper, the note for children or larger parties — 24 apart. */}
      <Text style={styles.help}>Set the usual number of adults. You can change it for each request.</Text>
      <Stepper testID="profile.travelers.adult" label="Adults" value={adult} min={1} max={9} onChange={setAdult} />
      <Text style={styles.caption}>For children or larger parties, add a note to your request.</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ModalSheet>
  );
});

const styles = StyleSheet.create({
  help: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
  caption: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary },
  error: { ...rn(tokens.type.caption), color: tokens.colors.statusDanger },
});
