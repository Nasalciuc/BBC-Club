import { BottomSheetModal, BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, CloseButton, tokens, rn } from "@bbc/ui";

import { postAccountPassword, type Profile } from "@/lib/api";
import type { ProfileSheetHandle } from "./types";

type Props = {
  profile: Profile;
  onSaved: (next: Profile) => void;
};

const SNAP = ["70%"] as const;

export const PasswordSheet = forwardRef<ProfileSheetHandle, Props>(function PasswordSheet({ profile, onSaved }, ref) {
  const modalRef = useRef<BottomSheetModal>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    present() {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setBusy(false);
      setError(null);
      modalRef.current?.present();
    },
    dismiss() {
      modalRef.current?.dismiss();
    },
  }));

  async function onSave() {
    if (!currentPassword.trim()) {
      setError("Enter your current password.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await postAccountPassword(newPassword, currentPassword);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onSaved(profile);
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
      <BottomSheetScrollView contentContainerStyle={styles.content} testID="profile.password.sheet">
        <View style={styles.header}>
          <Text style={styles.title}>Password</Text>
          <CloseButton testID="profile.password.close" onPress={() => modalRef.current?.dismiss()} />
        </View>

        <Field
          testID="profile.password.current"
          label="CURRENT"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secure
        />
        <Field testID="profile.password.new" label="NEW" value={newPassword} onChangeText={setNewPassword} secure />
        <Field
          testID="profile.password.confirm"
          label="CONFIRM"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secure
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          testID="profile.password.save"
          label={busy ? "Saving…" : "Save"}
          busy={busy}
          shape="pill"
          onPress={() => void onSave()}
        />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

function Field({
  testID,
  label,
  value,
  onChangeText,
  secure,
}: {
  testID: string;
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  secure?: boolean;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <BottomSheetTextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.field}
        placeholderTextColor={tokens.colors.textTertiary}
      />
    </View>
  );
}

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
  fieldWrap: { gap: tokens.space.xxs },
  fieldLabel: { ...rn(tokens.type.labelMono), color: tokens.colors.textSecondary },
  field: {
    minHeight: 56,
    borderRadius: tokens.radius.field,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    ...rn(tokens.type.body),
    color: tokens.colors.textPrimary,
    backgroundColor: tokens.colors.surfaceCard,
  },
  error: { ...rn(tokens.type.caption), color: tokens.colors.statusDanger },
});
