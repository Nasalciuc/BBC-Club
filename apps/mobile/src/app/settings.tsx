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

  // 34 draws each card's second row taller than its first; Help, which 34 does not draw, takes the look's own height.
  const rows: { key: string; label: string; url: string | undefined; height?: number }[] = [
    { key: "privacy", label: "Privacy policy", url: env.EXPO_PUBLIC_PRIVACY_URL, height: ROW.privacy },
    { key: "terms", label: "Terms of use", url: env.EXPO_PUBLIC_TERMS_URL, height: ROW.terms },
    { key: "help", label: "Help", url: env.EXPO_PUBLIC_HELP_URL },
  ];
  const legal = rows.filter((row): row is (typeof rows)[number] & { url: string } => Boolean(row.url));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenStatusBar on="light" />
      {/* 34: the back chevron and the page's title beside it. */}
      <TopBar title="Settings" look="settings" onBack={() => router.back()} backTestID="settings.back" />
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
            <RowGroup testID="settings.account" look="settings">
              <ListRow
                testID="settings.phone"
                icon="phone-fill"
                label="Phone"
                height={ROW.phone}
                value={profile ? (displayPhone(profile.phone) ?? "Add phone") : undefined}
                disabled={!profile}
                onPress={() => phoneRef.current?.present()}
              />
              <ListRow
                testID="settings.password"
                icon="lock-fill"
                label="Password"
                height={ROW.password}
                value="Change"
                disabled={!profile}
                onPress={() => passwordRef.current?.present()}
              />
            </RowGroup>
            <RowGroup look="settings">
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
          <RowGroup testID="settings.legal" look="settings">
            {legal.map((row) => (
              <ListRow
                key={row.key}
                testID={`settings.${row.key}`}
                icon="file-text"
                label={row.label}
                height={row.height}
                trailing="external"
                onPress={() => void Linking.openURL(row.url)}
              />
            ))}
          </RowGroup>
        ) : null}
        {/* It waits for the load like the rows above; a load that failed leaves it to tap, and a count that did not load
            is said without a number (ADR-IMPL-047). */}
        <View style={styles.deleteGap}>
          <ListRow
            testID="settings.delete"
            icon="trash"
            label="Delete account"
            danger
            look="settings"
            height={ROW.delete}
            disabled={!profile && !loadFailure}
            onPress={() => deleteRef.current?.present()}
          />
        </View>
        <Button
          testID="settings.signOut"
          label={signingOut ? "Signing out…" : "Sign out"}
          variant="destructive"
          busy={signingOut}
          height={36}
          text="settingsSignout"
          style={styles.signOut}
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

/**
 * 34 (and 35 under its sheet), measured: the rows' heights as drawn — Phone 45.4 and Password 48 in the first card,
 * Privacy policy 46.6 and Terms of use 48.4 in the third, Delete account 46.8 on its own.
 */
const ROW = { phone: 45.4, password: 48, privacy: 46.6, terms: 48.4, delete: 46.8 } as const;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  grow: { flex: 1 },
  // 34: the cards 14.8 pt in, 11.2 apart (15 before Delete account, 13.2 before Sign out), from under the top bar.
  content: { paddingHorizontal: 14.8, paddingBottom: tokens.space.lg, gap: 11.2 },
  deleteGap: { marginTop: 15 - 11.2 },
  signOut: { alignSelf: "stretch", borderWidth: 0.6, marginTop: 13.2 - 11.2 },
  // A message is `text-secondary`, never `status-danger` (DESIGN.md: that is for a field at fault only).
  message: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary, textAlign: "center" },
});
