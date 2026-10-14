import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BackButton, Button, tokens, rn } from "@bbc/ui";

import { ListRow } from "@/components/list-row";
import { RootTabBar } from "@/components/RootTabBar";
import { signOut } from "@/features/auth/flows";
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
import { isOpen } from "@/features/requests/status";
import { fetchProfile, fetchRequests, type Profile } from "@/lib/api";
import { env } from "@/lib/env";
import { displayPhone } from "@/lib/phone";

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [openRequests, setOpenRequests] = useState(0);
  const phoneRef = useRef<ProfileSheetHandle>(null);
  const passwordRef = useRef<ProfileSheetHandle>(null);
  const notificationsRef = useRef<ProfileSheetHandle>(null);
  const deleteRef = useRef<ProfileSheetHandle>(null);

  useEffect(() => {
    void (async () => {
      const [profileResult, requestsResult] = await Promise.all([fetchProfile(), fetchRequests()]);
      if (!profileResult.ok) {
        setError(profileResult.message);
        return;
      }
      setProfile(profileResult.data);
      if (requestsResult.ok) {
        setOpenRequests(requestsResult.data.items.filter((r) => isOpen(r.status)).length);
      }
    })().catch(() => setError("Something went wrong."));
  }, []);

  async function onSignOut() {
    setSigningOut(true);
    await signOut();
    router.replace("/sign-in");
  }

  function onSheetSaved(next: SavedProfile) {
    setProfile((prev) => (prev ? mergeSavedProfile(prev, next) : prev));
    setError(null);
  }

  const legal = [
    { key: "privacy", label: "Privacy policy", url: env.EXPO_PUBLIC_PRIVACY_URL },
    { key: "terms", label: "Terms of use", url: env.EXPO_PUBLIC_TERMS_URL },
    { key: "help", label: "Help", url: env.EXPO_PUBLIC_HELP_URL },
  ].filter((row): row is { key: string; label: string; url: string } => Boolean(row.url));

  return (
    // Figma 479:8226: the back button stays at the safe area; the page scrolls under it, 20 pt lower, and stops 16 pt
    // above the tab bar.
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.top}>
        <BackButton testID="settings.back" onPress={() => router.back()} />
      </View>
      <ScrollView testID="settings.root" style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          Settings.
        </Text>
        {error ? <Text style={styles.message}>{error}</Text> : null}
        <View style={styles.rows}>
          <ListRow
            testID="settings.phone"
            label="Phone"
            value={displayPhone(profile?.phone) ?? "Add phone"}
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
        </View>
        <Text style={styles.message}>Request updates are always on.</Text>
        <ListRow testID="settings.delete" label="Delete account" danger onPress={() => deleteRef.current?.present()} />
        {legal.length > 0 ? (
          <View style={styles.rows}>
            {legal.map((row) => (
              <ListRow
                key={row.key}
                testID={`settings.${row.key}`}
                label={row.label}
                size="sm"
                trailing="external"
                onPress={() => void Linking.openURL(row.url)}
              />
            ))}
          </View>
        ) : null}
        <Button
          testID="settings.signOut"
          label={signingOut ? "Signing out…" : "Sign out"}
          variant="secondary"
          busy={signingOut}
          onPress={() => void onSignOut()}
        />
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
  top: { paddingHorizontal: tokens.space.lg },
  scroll: { flex: 1, marginTop: 20, marginBottom: tokens.space.md },
  // Figma 479:8229: the title and each block 24 pt apart, 8 pt into the scroll.
  content: {
    paddingTop: tokens.space.xs,
    paddingHorizontal: tokens.space.lg,
    paddingBottom: tokens.space.lg,
    gap: tokens.space.lg,
  },
  title: { ...rn(tokens.type.display), color: tokens.colors.textPrimary },
  // A message is `text-secondary`, never `status-danger` (DESIGN.md: that is for a field at fault only).
  message: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  // Figma ListRow (37:72): white cards 8 pt apart.
  rows: { gap: tokens.space.xs },
});
