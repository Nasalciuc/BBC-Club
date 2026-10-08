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
  // Figma 238:5260 · Password saved: the sheet stays, says so, and closes on Done.
  const [saved, setSaved] = useState(false);

  useImperativeHandle(ref, () => ({
    present() {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setBusy(false);
      setError(null);
      setSaved(false);
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
    if (newPassword.length < 8 || !/[\d\W]/.test(newPassword)) {
      // The rule the sheet states (Figma 238:4974) — the same check Set password makes.
      setError("At least 8 characters, with one number or symbol.");
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
    setSaved(true);
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
        {saved ? (
          <>
            <View style={styles.header}>
              <Text style={styles.title}>Password updated</Text>
              <CloseButton testID="profile.password.close" onPress={() => modalRef.current?.dismiss()} />
            </View>
            <Text style={styles.headline} testID="profile.password.saved">
              Your new password is ready for your next sign-in.
            </Text>
            <Text style={styles.body}>Keep it private. We will never ask for your password by phone.</Text>
            <Button
              testID="profile.password.done"
              label="Done"
              variant="primary"
              shape="pill"
              onPress={() => modalRef.current?.dismiss()}
            />
          </>
        ) : (
          <>
            <View style={styles.header}>
              <Text style={styles.title}>Change password</Text>
              <CloseButton testID="profile.password.close" onPress={() => modalRef.current?.dismiss()} />
            </View>

            <Field
              testID="profile.password.current"
              label="CURRENT PASSWORD"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secure
            />
            <Field
              testID="profile.password.new"
              label="NEW PASSWORD"
              value={newPassword}
              onChangeText={setNewPassword}
              secure
            />
            <Field
              testID="profile.password.confirm"
              label="CONFIRM NEW PASSWORD"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secure
            />
            <Text style={styles.rule}>At least 8 characters, with one number or symbol.</Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button
              testID="profile.password.save"
              label={busy ? "Saving…" : "Save password"}
              variant="primary"
              busy={busy}
              shape="pill"
              onPress={() => void onSave()}
            />
          </>
        )}
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
  rule: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary },
  headline: { ...rn(tokens.type.headline), color: tokens.colors.textPrimary },
  body: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
});
