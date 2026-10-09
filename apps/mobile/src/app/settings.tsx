import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BackButton, Button, SectionLabel, StateMessage, tokens, rn } from "@bbc/ui";

import { ListRow } from "@/components/list-row";
import { deleteAccount, signOut } from "@/features/auth/flows";
import {
  mergeSavedProfile,
  offersSwitchValue,
  withOffers,
  type SavedProfile,
} from "@/features/profile/notifications-logic";
import { NotificationsSheet } from "@/features/profile/NotificationsSheet";
import { PasswordSheet } from "@/features/profile/PasswordSheet";
import { PhoneSheet } from "@/features/profile/PhoneSheet";
import type { ProfileSheetHandle } from "@/features/profile/types";
import { fetchProfile, fetchRequests, type Profile } from "@/lib/api";
import { env } from "@/lib/env";
import { deleteFailureKind, stateCopy } from "@/lib/error-context";

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [wrongPassword, setWrongPassword] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openRequests, setOpenRequests] = useState(0);
  const phoneRef = useRef<ProfileSheetHandle>(null);
  const passwordRef = useRef<ProfileSheetHandle>(null);
  const notificationsRef = useRef<ProfileSheetHandle>(null);

  useEffect(() => {
    void (async () => {
      const [profileResult, requestsResult] = await Promise.all([fetchProfile(), fetchRequests()]);
      if (!profileResult.ok) {
        setError(profileResult.message);
        return;
      }
      setProfile(profileResult.data);
      if (requestsResult.ok) {
        setOpenRequests(requestsResult.data.items.filter((r) => r.status !== "booked" && r.status !== "closed").length);
      }
    })().catch(() => setError("Something went wrong."));
  }, []);

  async function onDeleteConfirmed() {
    setBusy(true);
    setWrongPassword(false);
    const result = await deleteAccount(deletePassword);
    setBusy(false);
    if (!result.ok) {
      if (deleteFailureKind(result.code) === "wrongPassword") {
        setWrongPassword(true);
        return;
      }
      setConfirmDelete(false);
      setDeleteFailed(true);
      return;
    }
    setConfirmDelete(false);
    router.replace("/join");
  }

  async function onSignOut() {
    setBusy(true);
    await signOut();
    router.replace("/sign-in");
  }

  function onSheetSaved(next: SavedProfile) {
    setProfile((prev) => (prev ? mergeSavedProfile(prev, next) : prev));
    setError(null);
  }

  const privacyUrl = env.EXPO_PUBLIC_PRIVACY_URL;
  const termsUrl = env.EXPO_PUBLIC_TERMS_URL;
  const helpUrl = env.EXPO_PUBLIC_HELP_URL;

  return (
    <View style={styles.root}>
      <ScrollView
        testID="settings.root"
        contentContainerStyle={{
          paddingTop: insets.top + tokens.space.sm,
          paddingHorizontal: tokens.space.lg,
          paddingBottom: insets.bottom + tokens.space.xxl,
        }}
      >
        <BackButton testID="settings.back" onPress={() => router.back()} />
        <Text style={styles.title}>Settings</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <SectionLabel label="Account" />
        <ListRow
          testID="settings.phone"
          label="Phone"
          value={profile?.phone ?? "Add phone"}
          onPress={() => phoneRef.current?.present()}
        />
        <ListRow
          testID="settings.password"
          label="Password"
          value="Change"
          onPress={() => passwordRef.current?.present()}
        />
        <ListRow
          testID="settings.notifications"
          label="Notifications"
          value="Preferences"
          onPress={() => notificationsRef.current?.present()}
        />
        <Text style={styles.hint}>Request updates are always on.</Text>
        <SectionLabel label="Legal & support" />
        {privacyUrl ? (
          <ListRow testID="settings.privacy" label="Privacy policy" onPress={() => void Linking.openURL(privacyUrl)} />
        ) : null}
        {termsUrl ? (
          <ListRow testID="settings.terms" label="Terms of use" onPress={() => void Linking.openURL(termsUrl)} />
        ) : null}
        {helpUrl ? <ListRow testID="settings.help" label="Help" onPress={() => void Linking.openURL(helpUrl)} /> : null}
        {deleteFailed ? (
          <StateMessage
            testID="settings.deleteFailed"
            variant="error"
            title={stateCopy("deleteFailed").title}
            body={stateCopy("deleteFailed").body}
            primary={{ label: "Try again", onPress: () => setDeleteFailed(false) }}
          />
        ) : null}
        <PressableDelete
          onPress={() => {
            setDeletePassword("");
            setWrongPassword(false);
            setConfirmDelete(true);
          }}
        />
        <Button
          testID="settings.signOut"
          label="Sign out"
          variant="ghost"
          shape="card"
          busy={busy}
          onPress={() => void onSignOut()}
          style={{ marginTop: tokens.space.lg }}
        />
      </ScrollView>
      <Modal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(false)}>
        <View style={styles.scrim}>
          <View style={styles.modalCard} testID="profile.deleteConfirm">
            <Text style={styles.modalTitle}>Delete your account?</Text>
            <Text style={styles.modalBody}>
              Your profile, preferences and request history are removed from the app. This can’t be undone.
              {openRequests > 0 ? ` This closes ${openRequests} open request${openRequests === 1 ? "" : "s"}.` : ""}
            </Text>
            <Text style={styles.modalLabel}>Password</Text>
            <TextInput
              testID="profile.deleteConfirm.password"
              value={deletePassword}
              onChangeText={(v) => {
                setDeletePassword(v);
                setWrongPassword(false);
              }}
              secureTextEntry
              style={[styles.password, wrongPassword && styles.passwordError]}
            />
            {wrongPassword ? (
              <Text testID="profile.deleteConfirm.wrongPassword" style={styles.wrong}>
                {stateCopy("wrongPassword").title}
              </Text>
            ) : null}
            <Button
              testID="profile.deleteConfirm.confirm"
              label="Delete account"
              variant="destructive"
              shape="pill"
              busy={busy}
              onPress={() => void onDeleteConfirmed()}
            />
            <Button
              testID="profile.deleteConfirm.cancel"
              label="Cancel"
              variant="ghost"
              shape="pill"
              onPress={() => setConfirmDelete(false)}
            />
          </View>
        </View>
      </Modal>
      {profile ? (
        <>
          <PasswordSheet ref={passwordRef} profile={profile} onSaved={onSheetSaved} />
          <PhoneSheet ref={phoneRef} profile={profile} onSaved={onSheetSaved} />
          <NotificationsSheet
            ref={notificationsRef}
            savedOffers={offersSwitchValue(profile)}
            onSaved={(offers) => setProfile((prev) => (prev ? withOffers(prev, offers) : prev))}
          />
        </>
      ) : null}
    </View>
  );
}

function PressableDelete({ onPress }: { onPress: () => void }) {
  return (
    <Pressable testID="settings.delete" accessibilityRole="button" onPress={onPress} style={styles.delete}>
      <Text style={styles.deleteText}>Delete account</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  title: { ...rn(tokens.type.display), color: tokens.colors.textPrimary, marginBottom: tokens.space.lg },
  error: { ...rn(tokens.type.bodySm), color: tokens.colors.statusDanger, marginBottom: tokens.space.sm },
  hint: { ...rn(tokens.type.caption), color: tokens.colors.textTertiary, marginBottom: tokens.space.sm },
  delete: { marginTop: tokens.space.xl },
  deleteText: { ...rn(tokens.type.body), color: tokens.colors.statusDanger },
  scrim: {
    flex: 1,
    backgroundColor: tokens.colors.scrim,
    justifyContent: "center",
    padding: tokens.space.lg,
  },
  modalCard: {
    backgroundColor: tokens.colors.surfaceCard,
    borderRadius: tokens.radius.panel,
    padding: tokens.space.lg,
    gap: tokens.space.md,
  },
  modalTitle: { ...rn(tokens.type.title), color: tokens.colors.textPrimary },
  modalBody: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
  modalLabel: { ...rn(tokens.type.caption), color: tokens.colors.textTertiary },
  password: {
    ...rn(tokens.type.body),
    color: tokens.colors.textPrimary,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.field,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
  },
  passwordError: { borderColor: tokens.colors.statusDanger },
  wrong: { ...rn(tokens.type.caption), color: tokens.colors.statusDanger },
});
