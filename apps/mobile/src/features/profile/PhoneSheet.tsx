import { BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Icon, tokens, rn } from "@bbc/ui";

import { PhoneField } from "@/components/phone-field";
import { patchProfile, type Profile } from "@/lib/api";
import { defaultPhoneCountry, splitStoredPhone, validatePhone, type CountryCode } from "@/lib/phone";
import type { ProfileSheetHandle } from "./types";

type Props = {
  profile: Profile;
  onSaved: (next: Profile) => void;
};

const SNAP = ["50%"] as const;

export const PhoneSheet = forwardRef<ProfileSheetHandle, Props>(function PhoneSheet({ profile, onSaved }, ref) {
  const modalRef = useRef<BottomSheetModal>(null);
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState<CountryCode>(() => defaultPhoneCountry());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const parsed = validatePhone(phone, country);
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
    <BottomSheetModal
      ref={modalRef}
      snapPoints={[...SNAP]}
      enablePanDownToClose={!busy}
      keyboardBehavior="interactive"
      backgroundStyle={styles.bg}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetScrollView contentContainerStyle={styles.content} testID="profile.phone.sheet">
        <View style={styles.header}>
          <Text style={styles.title}>Phone</Text>
          <Pressable
            testID="profile.phone.close"
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
            onPress={() => modalRef.current?.dismiss()}
          >
            <Icon name="clear" size={20} />
          </Pressable>
        </View>

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

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          testID="profile.phone.save"
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
