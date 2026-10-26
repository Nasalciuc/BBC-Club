import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, Button, ModalSheet, type ModalSheetHandle, PROFILE_AVATAR, TextButton, rn, tokens } from "@bbc/ui";

import { deleteProfilePhoto, putProfilePhoto, type Profile } from "@/lib/api";
import { monogram } from "@/lib/monogram";
import { photoActions, photoFailureCopy } from "./photo-logic";
import { photoPickerReady, pickPhoto } from "./photo-native";
import { portraitOf } from "./portrait";
import type { ProfileSheetHandle } from "./types";

type Props = {
  profile: Profile;
  onSaved: (next: Profile) => void;
};

/**
 * The member's own photo (brief 3.4.2, ADR-IMPL-070). 36 draws no such sheet; it is the profile's question sheet: the
 * portrait as Profile shows it, what the photo is for and who sees it, `Choose a photo` (the system's photo library,
 * then its square crop) and, once there is one, `Remove photo`. `Choose` only on a build that has the picker
 * (photo-native.ts `photoPickerReady`, D4); `Remove` on any, as it needs no native module (`photoActions`). While a
 * photo is being saved or removed the sheet has no way out (no drag, no ×, no Back) until the answer, so a second write
 * cannot start under it. A photo that cannot be used or saved says so in slate, and the sheet stays.
 */
export const PhotoSheet = forwardRef<ProfileSheetHandle, Props>(function PhotoSheet({ profile, onSaved }, ref) {
  const modalRef = useRef<ModalSheetHandle>(null);
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<"choose" | "remove" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const messageRef = useRef<Text>(null);
  useEffect(() => {
    if (message) modalRef.current?.reveal(messageRef.current);
  }, [message]);

  useImperativeHandle(ref, () => ({
    present() {
      // `busy` stays: a write still on its way keeps the sheet shut until it answers, and clears it then.
      setMessage(null);
      modalRef.current?.present();
    },
    dismiss() {
      modalRef.current?.dismiss();
    },
  }));

  async function onChoose() {
    setBusy("choose");
    setMessage(null);
    const picked = await pickPhoto();
    if (picked.kind !== "photo") {
      setBusy(null);
      if (picked.kind === "failed") setMessage(photoFailureCopy(picked.stage));
      return;
    }
    const result = await putProfilePhoto(picked.bytes);
    setBusy(null);
    if (!result.ok) {
      setMessage(photoFailureCopy("upload", result.message));
      return;
    }
    onSaved(result.data);
    modalRef.current?.dismiss();
  }

  async function onRemove() {
    setBusy("remove");
    setMessage(null);
    const result = await deleteProfilePhoto();
    setBusy(null);
    if (!result.ok) {
      setMessage(photoFailureCopy("upload", result.message));
      return;
    }
    onSaved(result.data);
    modalRef.current?.dismiss();
  }

  const hasPhoto = Boolean(profile.photo);
  const actions = photoActions(photoPickerReady, hasPhoto);
  return (
    <ModalSheet
      ref={modalRef}
      title="Photo"
      size="medium"
      closeTestID="profile.photo.close"
      testID="profile.photo.sheet"
      dismissible={busy === null}
      closable={busy === null}
      insets={insets}
      footer={
        <View style={styles.answers}>
          {actions.choose ? (
            <Button
              testID="profile.photo.choose"
              label={busy === "choose" ? "Saving…" : hasPhoto ? "Choose a new photo" : "Choose a photo"}
              variant="primary"
              busy={busy === "choose"}
              disabled={busy !== null}
              onPress={() => void onChoose()}
            />
          ) : null}
          {actions.remove ? (
            <TextButton
              testID="profile.photo.remove"
              label={busy === "remove" ? "Removing…" : "Remove photo"}
              tone="secondary"
              size="button"
              disabled={busy !== null}
              onPress={() => void onRemove()}
            />
          ) : null}
        </View>
      }
    >
      <View style={styles.portrait}>
        <Avatar
          testID="profile.photo.preview"
          initials={monogram(profile.displayName)}
          photo={portraitOf(profile)}
          size={PROFILE_AVATAR}
        />
      </View>
      <Text style={styles.intro}>
        Your photo shows on Profile and beside your greeting. Only you see it, and it goes with your account.
      </Text>
      {message ? (
        <Text ref={messageRef} testID="profile.photo.error" style={styles.message} accessibilityLiveRegion="polite">
          {message}
        </Text>
      ) : null}
    </ModalSheet>
  );
});

const styles = StyleSheet.create({
  portrait: { alignItems: "center", paddingBottom: tokens.space.md },
  intro: { ...rn(tokens.type.body), color: tokens.colors.textSecondary, textAlign: "center" },
  answers: { gap: tokens.space.sm, alignItems: "stretch" },
  // A message is `text-secondary`, never `status-danger` (DESIGN.md: that is for a field at fault only).
  message: {
    ...rn(tokens.type.bodySm),
    color: tokens.colors.textSecondary,
    textAlign: "center",
    marginTop: tokens.space.sm,
  },
});
