import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, ModalSheet, type ModalSheetHandle, tokens, rn } from "@bbc/ui";

import { postAccountPassword, type Profile } from "@/lib/api";
import { PasswordField } from "./PasswordField";
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
        // Figma 238:4974: three fields, their labels in sentence case, `Enter password` and the eye in each; the rule
        // under them, 24 pt apart.
        <>
          <PasswordField
            testID="profile.password.current"
            label="Current password"
            labelTone="bodySm"
            value={currentPassword}
            onChangeText={setCurrentPassword}
          />
          <PasswordField
            testID="profile.password.new"
            label="New password"
            labelTone="bodySm"
            value={newPassword}
            onChangeText={setNewPassword}
          />
          <PasswordField
            testID="profile.password.confirm"
            label="Confirm new password"
            labelTone="bodySm"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
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

const styles = StyleSheet.create({
  error: { ...rn(tokens.type.caption), color: tokens.colors.statusDanger },
  rule: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary },
  headline: { ...rn(tokens.type.headline), color: tokens.colors.textPrimary },
  body: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
});
