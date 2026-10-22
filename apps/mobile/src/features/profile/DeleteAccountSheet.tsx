import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  belowBaseline,
  Button,
  DELETE_BODY,
  DELETE_PARTS,
  MODAL_SHEET_LOOKS,
  ModalSheet,
  type ModalSheetHandle,
  rn,
  TextButton,
  tokens,
} from "@bbc/ui";

import { deleteAccount } from "@/features/auth/flows";
import { deleteFailureKind, stateCopy } from "@/lib/error-context";
import { PasswordField } from "./PasswordField";
import { openRequestsLine } from "./profile-logic";
import type { ProfileSheetHandle } from "./types";

/** 35 is drawn over a 34-pt home indicator: a taller inset makes the sheet taller by the difference. */
const IMAGE_INSET = 34;

type Props = {
  /** The member's requests still in progress: deleting the account closes them, and the sheet says so — `more` when the
   *  server's first page did not hold them all (`openRequestsFor`, F106). */
  /** null: the count did not load — the sheet says open requests are closed, without a number. */
  openRequests: { count: number; more: boolean } | null;
  /** The account is gone and the session with it. */
  onDeleted: () => void;
};

/**
 * 35: the deletion, confirmed with the password — what goes, how many open requests close, the password with its lock,
 * the filled red `Delete account` and `Cancel` under it; no × (the sheet's own `Cancel`, its backdrop and a drag close
 * it). A wrong password marks the field and says so under it; any other failure says so in the sheet, which stays open
 * to try again.
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
      look="delete"
      title="Delete your account?"
      closeTestID="profile.deleteConfirm.close"
      testID="profile.deleteConfirm"
      dismissible={!busy}
      showClose={false}
      height={MODAL_SHEET_LOOKS.delete.height + Math.max(0, insets.bottom - IMAGE_INSET)}
      insets={insets}
      footer={
        <View style={styles.answers}>
          <Button
            testID="profile.deleteConfirm.confirm"
            label={busy ? "Deleting…" : "Delete account"}
            variant="destructive-filled"
            height={DELETE_PARTS.pill}
            text="buttonDelete"
            busy={busy}
            onPress={() => void onDelete()}
          />
          <TextButton
            testID="profile.deleteConfirm.cancel"
            label="Cancel"
            tone="primary"
            text="buttonCancel"
            disabled={busy}
            onPress={() => modalRef.current?.dismiss()}
          />
        </View>
      }
    >
      <Text style={styles.body}>
        Your profile, preferences and request history are removed from the app. This can’t be undone.
        {/* 35: what closes with the account on a line of its own. */}
        {openRequestsLine(openRequests) ? `\n${openRequestsLine(openRequests)}` : ""}
      </Text>
      <View style={styles.password}>
        <PasswordField
          testID="profile.deleteConfirm.password"
          label="Password"
          labelTone="caption"
          icon="lock-fill"
          look="delete"
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
  // 35: the words in slate on their own pitch, the field 21.5 under their last baseline, the red pill and `Cancel`.
  body: { ...DELETE_BODY, color: tokens.colors.textSecondary },
  password: { gap: tokens.space.xs, marginTop: DELETE_PARTS.field - belowBaseline(DELETE_BODY) },
  answers: { gap: DELETE_PARTS.gap, alignItems: "stretch" },
  // The field at fault: its explanation right under it (319:202).
  wrong: { ...rn(tokens.type.caption), color: tokens.colors.statusDangerText },
  // A message is `text-secondary`, never `status-danger` (DESIGN.md: that is for a field at fault only).
  failed: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
});
