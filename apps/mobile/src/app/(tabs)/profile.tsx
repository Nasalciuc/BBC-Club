import Constants from "expo-constants";
import { useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, SectionLabel, tokens, rn } from "@bbc/ui";

import { ListRow } from "@/components/list-row";
import { deleteAccount, signOut } from "@/features/auth/flows";
import { CabinSheet } from "@/features/profile/CabinSheet";
import { HomeAirportSheet } from "@/features/profile/HomeAirportSheet";
import { PasswordSheet } from "@/features/profile/PasswordSheet";
import { PhoneSheet } from "@/features/profile/PhoneSheet";
import { TravelersSheet } from "@/features/profile/TravelersSheet";
import type { ProfileSheetHandle } from "@/features/profile/types";
import { fetchProfile, fetchRequests, type Profile } from "@/lib/api";
import { env } from "@/lib/env";

function monogram(name: string | null | undefined): string {
  if (!name?.trim()) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function travelersLabel(prefs: Profile["preferences"] | undefined): string {
  const p = prefs?.passengers;
  if (!p) return "1 adult";
  const parts: string[] = [];
  parts.push(`${p.adult} adult${p.adult === 1 ? "" : "s"}`);
  if (p.child > 0) parts.push(`${p.child} child${p.child === 1 ? "" : "ren"}`);
  if (p.infant > 0) parts.push(`${p.infant} infant${p.infant === 1 ? "" : "s"}`);
  return parts.join(", ");
}

function clientSinceYear(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const y = new Date(iso).getFullYear();
  return Number.isFinite(y) ? String(y) : null;
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openRequests, setOpenRequests] = useState(0);
  const [sinceOpen, setSinceOpen] = useState(false);

  const homeAirportRef = useRef<ProfileSheetHandle>(null);
  const cabinRef = useRef<ProfileSheetHandle>(null);
  const travelersRef = useRef<ProfileSheetHandle>(null);
  const passwordRef = useRef<ProfileSheetHandle>(null);
  const phoneRef = useRef<ProfileSheetHandle>(null);

  useEffect(() => {
    void (async () => {
      const [profileResult, requestsResult] = await Promise.all([fetchProfile(), fetchRequests()]);
      if (!profileResult.ok) {
        setError(profileResult.message);
        setLoading(false);
        return;
      }
      setProfile(profileResult.data);
      if (requestsResult.ok) {
        setOpenRequests(requestsResult.data.items.filter((r) => r.status !== "booked" && r.status !== "closed").length);
      }
      setLoading(false);
    })().catch(() => {
      setError("Something went wrong.");
      setLoading(false);
    });
  }, []);

  async function onSignOut() {
    setBusy(true);
    await signOut();
    router.replace("/sign-in");
  }

  async function onDeleteConfirmed() {
    setBusy(true);
    const result = await deleteAccount();
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      setConfirmDelete(false);
      return;
    }
    setConfirmDelete(false);
    router.replace("/join");
  }

  if (loading) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={tokens.colors.primary} />
      </View>
    );
  }

  const version = Constants.expoConfig?.version ?? "0.1.0";
  const build = Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode ?? "24";
  const displayName = profile?.displayName?.trim() || "Member";
  const initials = monogram(profile?.displayName);
  const sinceYear = clientSinceYear(profile?.memberSince);
  const showClientSince = profile?.crmLinkedAt != null && sinceYear != null;
  const supportPhone = env.EXPO_PUBLIC_SUPPORT_PHONE;
  const privacyUrl = env.EXPO_PUBLIC_PRIVACY_URL;
  const termsUrl = env.EXPO_PUBLIC_TERMS_URL;
  const cabinLabel = profile?.preferences?.cabin === "first" ? "First" : "Business";

  function onSheetSaved(next: Profile) {
    setProfile(next);
    setError(null);
  }

  return (
    <ScrollView
      testID="profile.root"
      style={styles.root}
      contentContainerStyle={{
        paddingTop: insets.top + tokens.space.md,
        paddingHorizontal: tokens.space.lg,
        paddingBottom: insets.bottom + tokens.space.xxl,
      }}
    >
      <View style={styles.header}>
        <View style={styles.monogram}>
          {initials ? <Text style={styles.monogramText}>{initials}</Text> : <Text style={styles.monogramText}>·</Text>}
        </View>
        <Text style={styles.name}>{displayName}</Text>
        {showClientSince ? (
          <Pressable
            testID="profile.since"
            accessibilityRole="button"
            onPress={() => setSinceOpen(true)}
            style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
          >
            <Text style={styles.pillText}>Client since {sinceYear}</Text>
          </Pressable>
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <SectionLabel label="Travel" />
      <ListRow
        testID="profile.homeAirport"
        label="Home airport"
        value={profile?.homeAirport ?? "Not set"}
        onPress={() => homeAirportRef.current?.present()}
      />
      <ListRow testID="profile.cabin" label="Cabin" value={cabinLabel} onPress={() => cabinRef.current?.present()} />
      <ListRow
        testID="profile.travelers"
        label="Travelers"
        value={travelersLabel(profile?.preferences)}
        onPress={() => travelersRef.current?.present()}
      />

      <SectionLabel label="Account" />
      <ListRow testID="profile.email" label="Email" value={profile?.email ?? "—"} />
      <Text style={styles.hint}>Contact support if you need to change your email.</Text>
      <ListRow
        testID="profile.phone"
        label="Phone"
        value={profile?.phone ?? "Add phone"}
        onPress={() => phoneRef.current?.present()}
      />
      <ListRow
        testID="profile.password"
        label="Password"
        value="On file"
        onPress={() => passwordRef.current?.present()}
      />
      <ListRow
        testID="profile.notifications"
        label="Notifications"
        value="On"
        onPress={() => router.push("/notifications" as Href)}
      />

      <SectionLabel label="Legal & support" />
      {privacyUrl || termsUrl ? (
        <>
          {privacyUrl ? (
            <ListRow testID="profile.privacy" label="Privacy policy" onPress={() => void Linking.openURL(privacyUrl)} />
          ) : (
            <ListRow testID="profile.privacy" label="Privacy policy" value="Coming soon" />
          )}
          {termsUrl ? (
            <ListRow testID="profile.terms" label="Terms" onPress={() => void Linking.openURL(termsUrl)} />
          ) : (
            <ListRow testID="profile.terms" label="Terms" value="Coming soon" />
          )}
        </>
      ) : (
        <ListRow testID="profile.legal" label="Privacy policy · Terms" value="Coming soon" />
      )}
      {supportPhone ? (
        <ListRow
          testID="profile.callSupport"
          label="Call support"
          icon="call"
          trailing="none"
          onPress={() => void Linking.openURL(`tel:${supportPhone}`)}
        />
      ) : (
        <ListRow testID="profile.callSupport" label="Call support" value="Coming soon" icon="call" />
      )}

      <Button
        testID="profile.signOut"
        label="Sign out"
        variant="ghost"
        shape="card"
        busy={busy}
        onPress={() => void onSignOut()}
        style={{ marginTop: tokens.space.lg }}
      />

      <Pressable
        testID="profile.delete"
        accessibilityRole="button"
        onPress={() => setConfirmDelete(true)}
        style={({ pressed }) => [styles.deleteLink, pressed && styles.pressed]}
      >
        <Text style={styles.deleteText}>Delete account</Text>
      </Pressable>

      <Text style={styles.version}>{`VERSION ${version} (${build})`}</Text>

      <Modal visible={sinceOpen} transparent animationType="fade" onRequestClose={() => setSinceOpen(false)}>
        <Pressable testID="profile.since.scrim" style={styles.scrim} onPress={() => setSinceOpen(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Client since {sinceYear}</Text>
            <Text style={styles.modalBody}>
              {`You've been with BuyBusinessClass since ${sinceYear}. That year is when your advisor first opened your file — not a membership tier.`}
            </Text>
            <Button testID="profile.since.close" label="Got it" shape="card" onPress={() => setSinceOpen(false)} />
          </View>
        </Pressable>
      </Modal>

      <Modal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(false)}>
        <View style={styles.scrim}>
          <View style={styles.modalCard} testID="profile.deleteConfirm">
            <Text style={styles.modalTitle}>Delete your account?</Text>
            <Text style={styles.modalBody}>
              This removes your profile and closes {openRequests} open request
              {openRequests === 1 ? "" : "s"}. Offers and request history disappear. You will need to join again to
              request fares.
            </Text>
            <Button
              testID="profile.deleteConfirm.confirm"
              label="Delete account"
              variant="destructive"
              shape="card"
              busy={busy}
              onPress={() => void onDeleteConfirmed()}
            />
            <Button
              testID="profile.deleteConfirm.cancel"
              label="Cancel"
              variant="ghost"
              shape="card"
              onPress={() => setConfirmDelete(false)}
            />
          </View>
        </View>
      </Modal>

      {profile ? (
        <>
          <HomeAirportSheet ref={homeAirportRef} profile={profile} onSaved={onSheetSaved} />
          <CabinSheet ref={cabinRef} profile={profile} onSaved={onSheetSaved} />
          <TravelersSheet ref={travelersRef} profile={profile} onSaved={onSheetSaved} />
          <PasswordSheet ref={passwordRef} profile={profile} onSaved={onSheetSaved} />
          <PhoneSheet ref={phoneRef} profile={profile} onSaved={onSheetSaved} />
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  centered: { alignItems: "center", justifyContent: "center" },
  header: { alignItems: "center", gap: tokens.space.sm, marginBottom: tokens.space.lg },
  monogram: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: tokens.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  monogramText: { ...rn(tokens.type.title), color: tokens.colors.textOnDark },
  name: { ...rn(tokens.type.title), color: tokens.colors.textPrimary },
  pill: {
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.borderDefault,
    paddingHorizontal: tokens.space.sm,
    paddingVertical: tokens.space.xxs,
  },
  pillText: { ...rn(tokens.type.caption), color: tokens.colors.textPrimary },
  error: { ...rn(tokens.type.bodySm), color: tokens.colors.statusDanger, marginBottom: tokens.space.sm },
  hint: {
    ...rn(tokens.type.caption),
    color: tokens.colors.textTertiary,
    marginTop: -tokens.space.xs,
    marginBottom: tokens.space.sm,
  },
  deleteLink: { marginTop: tokens.space.xl, alignItems: "center" },
  deleteText: { ...rn(tokens.type.body), color: tokens.colors.statusDanger },
  version: {
    ...rn(tokens.type.labelMono),
    color: tokens.colors.textTertiary,
    textAlign: "center",
    marginTop: tokens.space.lg,
  },
  pressed: { opacity: 0.7 },
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
});
