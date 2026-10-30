import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, ModalSheet, type ModalSheetHandle, TextField, tokens, rn } from "@bbc/ui";

import { patchProfile, type Profile } from "@/lib/api";
import { checkName, nameSaveFailure } from "./name-logic";
import type { ProfileSheetHandle } from "./types";

type Props = {
  profile: Profile;
  onSaved: (next: Profile) => void;
};

/**
 * The member's own name (brief 3.4.1): the one Explore greets them by, Profile shows and every request starts from. 36
 * draws no such sheet; it is the profile's one-field sheet, as Phone's (320:5969) — what the name is for, then
 * `Full name` over one field. A name the club cannot take turns the border red and says why under it (name-logic.ts:
 * the request sheet's rule); a save that did not reach the club says so in slate, and the name stays as typed.
 */
export const NameSheet = forwardRef<ProfileSheetHandle, Props>(function NameSheet({ profile, onSaved }, ref) {
  const modalRef = useRef<ModalSheetHandle>(null);
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: boolean; message: string } | null>(null);
  // With the keyboard up a new error scrolls into view above the keys.
  const errorRef = useRef<Text>(null);
  useEffect(() => {
    if (error) modalRef.current?.reveal(errorRef.current);
  }, [error]);

  useImperativeHandle(ref, () => ({
    present() {
      setName(profile.displayName?.trim() ?? "");
      setBusy(false);
      setError(null);
      modalRef.current?.present();
    },
    dismiss() {
      modalRef.current?.dismiss();
    },
  }));

  async function onSave() {
    const checked = checkName(name);
    if (!checked.ok) {
      setError({ field: true, message: checked.error });
      return;
    }
    setBusy(true);
    setError(null);
    const result = await patchProfile({ displayName: checked.name });
    setBusy(false);
    if (!result.ok) {
      setError(nameSaveFailure(result));
      return;
    }
    onSaved(result.data);
    modalRef.current?.dismiss();
  }

  return (
    <ModalSheet
      ref={modalRef}
      title="Name"
      size="short"
      closeTestID="profile.name.close"
      testID="profile.name.sheet"
      dismissible={!busy}
      insets={insets}
      footer={
        <Button
          testID="profile.name.save"
          label={busy ? "Saving…" : "Save name"}
          variant="primary"
          busy={busy}
          onPress={() => void onSave()}
        />
      }
    >
      <Text style={styles.intro}>How we greet you, and who your agent asks for when they call.</Text>
      <View style={styles.group}>
        <TextField
          testID="profile.name.input"
          label="Full name"
          value={name}
          onChangeText={(v) => {
            // While a save runs the name stands still: what is saved is what the field showed at `Save name`.
            if (busy) return;
            setName(v);
            setError(null);
          }}
          error={Boolean(error?.field)}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          autoCorrect={false}
          returnKeyType="done"
        />
        {error ? (
          <Text
            ref={errorRef}
            testID="profile.name.error"
            style={error.field ? styles.error : styles.message}
            accessibilityLiveRegion="polite"
          >
            {error.message}
          </Text>
        ) : null}
      </View>
    </ModalSheet>
  );
});

const styles = StyleSheet.create({
  intro: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
  // 325:8525: the error 8 pt under the field, in the danger colour — the field's own fault only.
  group: { gap: tokens.space.xs },
  error: { ...rn(tokens.type.caption), color: tokens.colors.statusDangerText },
  // A message is `text-secondary`, never `status-danger` (DESIGN.md: that is for a field at fault only).
  message: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
});
