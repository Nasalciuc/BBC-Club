import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, ModalSheet, type ModalSheetHandle, tokens, rn } from "@bbc/ui";

import { PhoneField } from "@/components/phone-field";
import { patchProfile, type Profile } from "@/lib/api";
import { defaultPhoneCountry, splitStoredPhone, validatePhone, type CountryCode } from "@/lib/phone";
import type { ProfileSheetHandle } from "./types";

type Props = {
  profile: Profile;
  onSaved: (next: Profile) => void;
};

export const PhoneSheet = forwardRef<ProfileSheetHandle, Props>(function PhoneSheet({ profile, onSaved }, ref) {
  const modalRef = useRef<ModalSheetHandle>(null);
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState<CountryCode>(() => defaultPhoneCountry());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // With the keyboard up a new error scrolls into view above the keys.
  const errorRef = useRef<Text>(null);
  useEffect(() => {
    if (error) modalRef.current?.reveal(errorRef.current);
  }, [error]);

  useImperativeHandle(ref, () => ({
    present() {
      const split = splitStoredPhone(profile.phone, defaultPhoneCountry());
      setPhone(split.national);
      setCountry(split.country);
      setBusy(false);
      setError(null);
      modalRef.current?.present();
    },
    dismiss() {
      modalRef.current?.dismiss();
    },
  }));

  async function onSave() {
    const parsed = validatePhone(phone, country, "profile");
    if (!parsed.valid) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await patchProfile({ phone: parsed.e164 });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onSaved(result.data);
    modalRef.current?.dismiss();
  }

  return (
    // Figma 320:5969: one field — the short sheet under a 28-pt headline.
    <ModalSheet
      ref={modalRef}
      title="Phone"
      size="short"
      closeTestID="profile.phone.close"
      testID="profile.phone.sheet"
      dismissible={!busy}
      insets={insets}
      footer={
        <Button
          testID="profile.phone.save"
          label={busy ? "Saving…" : "Save phone"}
          variant="primary"
          busy={busy}
          onPress={() => void onSave()}
        />
      }
    >
      <PhoneField
        testID="profile.phone.input"
        countryTestID="phone.country"
        value={phone}
        country={country}
        onChangeText={(v) => {
          setPhone(v);
          setError(null);
        }}
        onCountryChange={(c) => {
          setCountry(c);
          setError(null);
        }}
      />

      {error ? (
        <Text ref={errorRef} style={styles.error}>
          {error}
        </Text>
      ) : null}
    </ModalSheet>
  );
});

const styles = StyleSheet.create({
  error: { ...rn(tokens.type.caption), color: tokens.colors.statusDanger },
});
