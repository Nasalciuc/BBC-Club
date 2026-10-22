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
import { canConfirmDelete, deleteFailureCopy } from "./delete-logic";
import { PasswordField } from "./PasswordField";
import type { ProfileSheetHandle } from "./types";

/** 35 is drawn over a 34-pt home indicator: a taller inset makes the sheet taller by the difference. */
const IMAGE_INSET = 34;

type Props = {
  /** The member's requests still in progress: deleting the account closes them, and the sheet says so. */
  /** null: the count did not load — the sheet says open requests are closed, without a number. */
  openRequests: number | null;
  /** The account is gone and the session with it. */
  onDeleted: () => void;
};

/**
 * 35: the deletion, confirmed with the password — what goes, how many open requests close, the password with its lock,
 * the filled red `Delete account` and `Cancel` under it; no × (the sheet's own `Cancel`, its backdrop and a drag close
 * it). A wrong or missing password marks the field and says so under it; any other failure says so in the sheet, which
 * stays open to try again (delete-logic.ts: the hourly limit names the hour, no connection says so).
 */
export const DeleteAccountSheet = forwardRef<ProfileSheetHandle, Props>(function DeleteAccountSheet(
  { openRequests, onDeleted },
  ref,
) {
  const modalRef = useRef<ModalSheetHandle>(null);
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState("");
  /** Under the field: the password is what to change. */
  const [fieldMessage, setFieldMessage] = useState<string | null>(null);
  /** In the sheet: anything else. */
  const [sheetMessage, setSheetMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // With the keyboard up the message would sit under the keys or the pinned buttons: each new one scrolls into view.
  const messageRef = useRef<Text>(null);
  useEffect(() => {
    if (fieldMessage || sheetMessage) modalRef.current?.reveal(messageRef.current);
  }, [fieldMessage, sheetMessage]);

  useImperativeHandle(ref, () => ({
    present() {
      setPassword("");
      setFieldMessage(null);
      setSheetMessage(null);
      setBusy(false);
      modalRef.current?.present();
    },
    dismiss() {
      modalRef.current?.dismiss();
    },
  }));

  async function onDelete() {
    setBusy(true);
    setFieldMessage(null);
    setSheetMessage(null);
    const result = await deleteAccount(password);
    setBusy(false);
    if (!result.ok) {
      const copy = deleteFailureCopy(result.code, password.trim().length === 0);
      if (copy.at === "field") setFieldMessage(copy.text);
      else setSheetMessage(copy.text);
      return;
    }
    modalRef.current?.dismiss();
    onDeleted();
  }

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
            // Only with the password typed: the server deletes on an empty one (delete-logic.ts).
            disabled={!canConfirmDelete(password, busy)}
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
        {openRequests === null
          ? "\nAny open requests are closed."
          : openRequests > 0
            ? `\nThis closes ${openRequests} open request${openRequests === 1 ? "" : "s"}.`
            : ""}
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
            setFieldMessage(null);
          }}
          error={fieldMessage !== null}
        />
        {fieldMessage ? (
          <Text ref={messageRef} testID="profile.deleteConfirm.wrongPassword" style={styles.wrong}>
            {fieldMessage}
          </Text>
        ) : null}
      </View>
      {sheetMessage ? (
        <Text ref={messageRef} testID="settings.deleteFailed" style={styles.failed}>
          {sheetMessage}
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
