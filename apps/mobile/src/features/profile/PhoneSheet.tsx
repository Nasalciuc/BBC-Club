import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, ModalSheet, type ModalSheetHandle, TextField, tokens, rn } from "@bbc/ui";

import { patchProfile, type Profile } from "@/lib/api";
import { defaultPhoneCountry, displayPhone, validatePhone } from "@/lib/phone";
import type { ProfileSheetHandle } from "./types";

type Props = {
  profile: Profile;
  onSaved: (next: Profile) => void;
};

/**
 * Figma 320:5969 / 325:8525: the short sheet under its 28-pt headline — what the number is for, then `Phone number`
 * over one field holding the number as a person reads it (`+1 (212) 555-0148`). A number that does not parse turns the
 * border red and says so under it.
 */
export const PhoneSheet = forwardRef<ProfileSheetHandle, Props>(function PhoneSheet({ profile, onSaved }, ref) {
  const modalRef = useRef<ModalSheetHandle>(null);
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // With the keyboard up a new error scrolls into view above the keys.
  const errorRef = useRef<Text>(null);
  useEffect(() => {
    if (error) modalRef.current?.reveal(errorRef.current);
  }, [error]);

  useImperativeHandle(ref, () => ({
    present() {
      setPhone(displayPhone(profile.phone) ?? "");
      setBusy(false);
      setError(null);
      modalRef.current?.present();
    },
    dismiss() {
      modalRef.current?.dismiss();
    },
  }));

  async function onSave() {
    // One field: a number that starts with + carries its country; any other is read in the phone's own country.
    const parsed = validatePhone(phone, defaultPhoneCountry(), "profile");
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
      <Text style={styles.intro}>The number a specialist calls you on.</Text>
      <View style={styles.group}>
        <TextField
          testID="profile.phone.input"
          label="Phone number"
          labelTone="caption"
          value={phone}
          onChangeText={(v) => {
            setPhone(v);
            setError(null);
          }}
          error={Boolean(error)}
          keyboardType="phone-pad"
          autoComplete="tel"
        />
        {error ? (
          <Text ref={errorRef} testID="profile.phone.error" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </View>
    </ModalSheet>
  );
});

const styles = StyleSheet.create({
  intro: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
  // 325:8525: the error 8 pt under the field, in the danger colour.
  group: { gap: tokens.space.xs },
  error: { ...rn(tokens.type.caption), color: tokens.colors.statusDangerText },
});
