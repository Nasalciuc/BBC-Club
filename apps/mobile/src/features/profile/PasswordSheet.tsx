import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, ModalSheet, type ModalSheetHandle, tokens, rn } from "@bbc/ui";

import { postAccountPassword, type Profile } from "@/lib/api";
import type { ProfileSheetHandle } from "./types";

type Props = {
  profile: Profile;
  onSaved: (next: Profile) => void;
};

export const PasswordSheet = forwardRef<ProfileSheetHandle, Props>(function PasswordSheet({ profile, onSaved }, ref) {
  const modalRef = useRef<ModalSheetHandle>(null);
  const insets = useSafeAreaInsets();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Figma 238:5260 · Password saved: the sheet stays, says so, and closes on Done.
  const [saved, setSaved] = useState(false);
  // With the keyboard up the error would sit under the keys or the pinned button: each new one scrolls into view.
  const errorRef = useRef<Text>(null);
  useEffect(() => {
    if (error) modalRef.current?.reveal(errorRef.current);
  }, [error]);

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
    <ModalSheet
      ref={modalRef}
      title={saved ? "Password updated" : "Change password"}
      closeTestID="profile.password.close"
      testID="profile.password.sheet"
      dismissible={!busy}
      insets={insets}
      footer={
        saved ? (
          <Button
            testID="profile.password.done"
            label="Done"
            variant="primary"
            onPress={() => modalRef.current?.dismiss()}
          />
        ) : (
          <Button
            testID="profile.password.save"
            label={busy ? "Saving…" : "Save password"}
            variant="primary"
            busy={busy}
            onPress={() => void onSave()}
          />
        )
      }
    >
      {saved ? (
        <>
          <Text style={styles.headline} testID="profile.password.saved">
            Your new password is ready for your next sign-in.
          </Text>
          <Text style={styles.body}>Keep it private. We will never ask for your password by phone.</Text>
        </>
      ) : (
        <>
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

          {error ? (
            <Text ref={errorRef} style={styles.error}>
              {error}
            </Text>
          ) : null}
        </>
      )}
    </ModalSheet>
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
        placeholderTextColor={tokens.colors.textSecondary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
