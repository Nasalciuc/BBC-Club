import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, ListRow, RowGroup, StateMessage, TopBar, tokens, rn } from "@bbc/ui";

import { RootTabBar } from "@/components/RootTabBar";
import { ScreenStatusBar } from "@/components/screen-status-bar";
import { DeleteAccountSheet } from "@/features/profile/DeleteAccountSheet";
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
import { useSignOut } from "@/features/profile/useSignOut";
import { isOpen } from "@/features/requests/status";
import { fetchProfile, fetchRequests, type Profile } from "@/lib/api";
import { env } from "@/lib/env";
import { readFailureCopy, stateCopy } from "@/lib/error-context";
import { displayPhone } from "@/lib/phone";

/**
 * Settings (34), reached from Profile's round button over its photograph: the phone and the password, the
 * notifications, the privacy policy and the terms, `Delete account` and `Sign out` (ADR-IMPL-055 §9).
 */
export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<Profile | null>(null);
  // The profile's rows wait for the profile (ADR-IMPL-047): no number made up while it loads, no row that does nothing.
  // A profile that did not load takes their place, with `Try again`.
  const [loadFailure, setLoadFailure] = useState<{ title: string; body: string } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const { signingOut, failure: signOutFailure, signOutNow } = useSignOut();
  // null until the requests load: a count that did not load is never shown as none.
  const [openRequests, setOpenRequests] = useState<number | null>(null);
  const phoneRef = useRef<ProfileSheetHandle>(null);
  const passwordRef = useRef<ProfileSheetHandle>(null);
  const notificationsRef = useRef<ProfileSheetHandle>(null);
  const deleteRef = useRef<ProfileSheetHandle>(null);

  useEffect(() => {
    void (async () => {
      const [profileResult, requestsResult] = await Promise.all([fetchProfile(), fetchRequests()]);
      if (!profileResult.ok) {
        setLoadFailure(readFailureCopy(profileResult.code, "profile"));
        return;
      }
      setLoadFailure(null);
      setProfile(profileResult.data);
      if (requestsResult.ok) {
        setOpenRequests(requestsResult.data.items.filter((r) => isOpen(r.status)).length);
      }
    })().catch(() => setLoadFailure(stateCopy("route")));
  }, [reloadToken]);

  function onSheetSaved(next: SavedProfile) {
    setProfile((prev) => (prev ? mergeSavedProfile(prev, next) : prev));
  }

  const legal = [
    { key: "privacy", label: "Privacy policy", url: env.EXPO_PUBLIC_PRIVACY_URL },
    { key: "terms", label: "Terms of use", url: env.EXPO_PUBLIC_TERMS_URL },
    { key: "help", label: "Help", url: env.EXPO_PUBLIC_HELP_URL },
  ].filter((row): row is { key: string; label: string; url: string } => Boolean(row.url));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenStatusBar on="light" />
      {/* 34: the back chevron and the page's title beside it. */}
      <TopBar title="Settings" onBack={() => router.back()} backTestID="settings.back" />
      <ScrollView testID="settings.root" style={styles.grow} contentContainerStyle={styles.content}>
        {!profile && loadFailure ? (
          <StateMessage
            testID="settings.error"
            title={loadFailure.title}
            body={loadFailure.body}
            primary={{
              label: "Try again",
              testID: "settings.error.retry",
              // The rows come back, dimmed, while it loads again: never the old failure on screen.
              onPress: () => {
                setLoadFailure(null);
                setReloadToken((n) => n + 1);
              },
            }}
          />
        ) : (
          <>
            <RowGroup testID="settings.account">
              <ListRow
                testID="settings.phone"
                icon="phone"
                label="Phone"
                value={profile ? (displayPhone(profile.phone) ?? "Add phone") : undefined}
                disabled={!profile}
                onPress={() => phoneRef.current?.present()}
              />
              <ListRow
                testID="settings.password"
                icon="lock"
                label="Password"
                value="Change"
                disabled={!profile}
                onPress={() => passwordRef.current?.present()}
              />
            </RowGroup>
            <RowGroup>
              <ListRow
                testID="settings.notifications"
                icon="bell"
                label="Notifications"
                subtitle="Request updates are always on."
                value="Preferences"
                disabled={!profile}
                onPress={() => notificationsRef.current?.present()}
              />
            </RowGroup>
          </>
        )}
        {legal.length > 0 ? (
          <RowGroup testID="settings.legal">
            {legal.map((row) => (
              <ListRow
                key={row.key}
                testID={`settings.${row.key}`}
                icon="file-text"
                label={row.label}
                trailing="external"
                onPress={() => void Linking.openURL(row.url)}
              />
            ))}
          </RowGroup>
        ) : null}
        {/* It waits for the load like the rows above; a load that failed leaves it to tap, and a count that did not load
            is said without a number (ADR-IMPL-047). */}
        <ListRow
          testID="settings.delete"
          icon="trash"
          label="Delete account"
          danger
          disabled={!profile && !loadFailure}
          onPress={() => deleteRef.current?.present()}
        />
        <Button
          testID="settings.signOut"
          label={signingOut ? "Signing out…" : "Sign out"}
          variant="destructive"
          busy={signingOut}
          onPress={signOutNow}
        />
        {signOutFailure ? <Text style={styles.message}>{signOutFailure}</Text> : null}
      </ScrollView>
      <RootTabBar active="profile" />
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
      <DeleteAccountSheet ref={deleteRef} openRequests={openRequests} onDeleted={() => router.replace("/join")} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  grow: { flex: 1 },
  // 34: the groups 16 pt apart, from 16 pt under the top bar.
  content: {
    paddingTop: tokens.space.md,
    paddingHorizontal: tokens.space.gutter,
    paddingBottom: tokens.space.lg,
    gap: tokens.space.md,
  },
  // A message is `text-secondary`, never `status-danger` (DESIGN.md: that is for a field at fault only).
  message: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary, textAlign: "center" },
});
