import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, ModalSheet, type ModalSheetHandle, tokens, rn } from "@bbc/ui";

import { deleteAccount } from "@/features/auth/flows";
import { deleteFailureKind, stateCopy } from "@/lib/error-context";
import { PasswordField } from "./PasswordField";
import type { ProfileSheetHandle } from "./types";

type Props = {
  /** The member's requests still in progress: deleting the account closes them, and the sheet says so. */
  /** null: the count did not load — the sheet says open requests are closed, without a number. */
  openRequests: number | null;
  /** The account is gone and the session with it. */
  onDeleted: () => void;
};

/**
 * Figma 320:5810 / 325:8392: the deletion, confirmed with the password. A wrong password marks the field and says so
 * under it; any other failure says so in the sheet, which stays open to try again.
 */
export const DeleteAccountSheet = forwardRef<ProfileSheetHandle, Props>(function DeleteAccountSheet(
  { openRequests, onDeleted },
  ref,
) {
  const modalRef = useRef<ModalSheetHandle>(null);
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState("");
  const [wrongPassword, setWrongPassword] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  // With the keyboard up the message would sit under the keys or the pinned buttons: each new one scrolls into view.
  const messageRef = useRef<Text>(null);
  useEffect(() => {
    if (wrongPassword || failed) modalRef.current?.reveal(messageRef.current);
  }, [wrongPassword, failed]);

  useImperativeHandle(ref, () => ({
    present() {
      setPassword("");
      setWrongPassword(false);
      setFailed(false);
      setBusy(false);
      modalRef.current?.present();
    },
    dismiss() {
      modalRef.current?.dismiss();
    },
  }));

  async function onDelete() {
    setBusy(true);
    setWrongPassword(false);
    setFailed(false);
    const result = await deleteAccount(password);
    setBusy(false);
    if (!result.ok) {
      if (deleteFailureKind(result.code) === "wrongPassword") setWrongPassword(true);
      else setFailed(true);
      return;
    }
    modalRef.current?.dismiss();
    onDeleted();
  }

  const failure = stateCopy("deleteFailed");

  return (
    <ModalSheet
      ref={modalRef}
      size="medium"
      title="Delete your account?"
      closeTestID="profile.deleteConfirm.close"
      testID="profile.deleteConfirm"
      dismissible={!busy}
      insets={insets}
      footer={
        <>
          <Button
            testID="profile.deleteConfirm.confirm"
            label={busy ? "Deleting…" : "Delete account"}
            variant="destructive"
            busy={busy}
            onPress={() => void onDelete()}
          />
          <Button
            testID="profile.deleteConfirm.cancel"
            label="Cancel"
            variant="secondary"
            disabled={busy}
            style={styles.cancel}
            onPress={() => modalRef.current?.dismiss()}
          />
        </>
      }
    >
      <Text style={styles.body}>
        Your profile, preferences and request history are removed from the app. This can’t be undone.
        {openRequests === null
          ? " Any open requests are closed."
          : openRequests > 0
            ? ` This closes ${openRequests} open request${openRequests === 1 ? "" : "s"}.`
            : ""}
      </Text>
      {/* 325:8427: the label, the field and what is wrong with it, 8 pt apart. */}
      <View style={styles.password}>
        <PasswordField
          testID="profile.deleteConfirm.password"
          label="Password"
          labelTone="caption"
          value={password}
          onChangeText={(next) => {
            setPassword(next);
            setWrongPassword(false);
          }}
          error={wrongPassword}
        />
        {wrongPassword ? (
          <Text ref={messageRef} testID="profile.deleteConfirm.wrongPassword" style={styles.wrong}>
            {stateCopy("wrongPassword").title}
          </Text>
        ) : null}
      </View>
      {failed ? (
        <Text ref={messageRef} testID="settings.deleteFailed" style={styles.failed}>
          {failure.title} {failure.body}
        </Text>
      ) : null}
    </ModalSheet>
  );
});

const styles = StyleSheet.create({
  body: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
  password: { gap: tokens.space.xs },
  // The field at fault: its explanation right under it (319:202).
  wrong: { ...rn(tokens.type.caption), color: tokens.colors.statusDanger },
  // A message is `text-secondary`, never `status-danger` (DESIGN.md: that is for a field at fault only).
  failed: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  // 320:5966: Cancel is the 48-pt secondary button.
  cancel: { minHeight: 48, paddingVertical: tokens.space.sm },
});
