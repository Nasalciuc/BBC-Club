import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ClubButton } from "@/components/club-button";
import { ListRow } from "@/components/list-row";
import { Club } from "@/constants/club";
import { deleteAccount, signOut } from "@/features/auth/flows";
import { fetchProfile, putNotificationPreferences, type Profile } from "@/lib/api";

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [personalOffers, setPersonalOffers] = useState(true);
  const [broadcastOffers, setBroadcastOffers] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const result = await fetchProfile();
      if (!result.ok) {
        setError(result.message);
        setLoading(false);
        return;
      }
      setProfile(result.data);
      setLoading(false);
    })();
  }, []);

  async function onTogglePref(category: "offers_personal" | "offers_broadcast", enabled: boolean) {
    if (category === "offers_personal") setPersonalOffers(enabled);
    else setBroadcastOffers(enabled);
    await putNotificationPreferences({
      preferences: [
        {
          category,
          enabled,
        },
      ],
    });
  }

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
        <ActivityIndicator color={Club.colors.primary} />
      </View>
    );
  }

  return (
    <View testID="profile.root" style={[styles.root, { paddingTop: insets.top + Club.space.md }]}>
      <Text style={styles.kicker}>MEMBER</Text>
      <Text style={styles.title}>Profile</Text>
      {profile?.displayName ? <Text style={styles.name}>{profile.displayName}</Text> : null}
      {profile?.homeAirport ? <Text style={styles.meta}>Home airport · {profile.homeAirport}</Text> : null}

      {error ? (
        <Text testID="profile.error" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <Text style={styles.section}>NOTIFICATIONS</Text>
      <View style={styles.prefRow}>
        <Text style={styles.prefLabel}>Personal offers</Text>
        <Switch
          testID="profile.pref.personal"
          value={personalOffers}
          onValueChange={(v) => void onTogglePref("offers_personal", v)}
          trackColor={{ false: Club.colors.borderDefault, true: Club.colors.primary }}
          thumbColor={Club.colors.surfaceCard}
        />
      </View>
      <View style={styles.prefRow}>
        <Text style={styles.prefLabel}>Broadcast offers</Text>
        <Switch
          testID="profile.pref.broadcast"
          value={broadcastOffers}
          onValueChange={(v) => void onTogglePref("offers_broadcast", v)}
          trackColor={{ false: Club.colors.borderDefault, true: Club.colors.primary }}
          thumbColor={Club.colors.surfaceCard}
        />
      </View>

      <Text style={styles.section}>ACCOUNT</Text>
      <ListRow testID="profile.signOut" label="Sign out" chevron={false} onPress={() => void onSignOut()} />
      <ListRow
        testID="profile.delete"
        label="Delete account"
        chevron={false}
        danger
        onPress={() => setConfirmDelete(true)}
      />

      <Modal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(false)}>
        <View style={styles.modalScrim}>
          <View style={styles.modalCard} testID="profile.deleteConfirm">
            <Text style={styles.modalTitle}>Delete my account</Text>
            <Text style={styles.modalBody}>
              This permanently removes your membership and session. You can join again later with the same email.
            </Text>
            <ClubButton
              testID="profile.deleteConfirm.confirm"
              label="Delete my account"
              variant="destructive"
              disabled={busy}
              onPress={() => void onDeleteConfirmed()}
            />
            <Pressable
              testID="profile.deleteConfirm.cancel"
              accessibilityRole="button"
              onPress={() => setConfirmDelete(false)}
              style={styles.cancelHit}
            >
              <Text style={styles.cancel}>Not now</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Club.colors.surfacePage,
    paddingHorizontal: Club.space.gutter,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  kicker: {
    ...Club.type.labelMono,
    color: Club.colors.textSecondary,
    textTransform: "uppercase",
    marginBottom: Club.space.xs,
  },
  title: {
    ...Club.type.display,
    color: Club.colors.textPrimary,
    marginBottom: Club.space.sm,
  },
  name: {
    ...Club.type.title,
    color: Club.colors.textPrimary,
  },
  meta: {
    ...Club.type.bodySm,
    color: Club.colors.textSecondary,
    marginBottom: Club.space.lg,
  },
  error: {
    ...Club.type.caption,
    color: Club.colors.textSecondary,
    marginBottom: Club.space.md,
  },
  section: {
    ...Club.type.labelMono,
    color: Club.colors.textSecondary,
    textTransform: "uppercase",
    marginTop: Club.space.xl,
    marginBottom: Club.space.sm,
  },
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: Club.colors.borderDefault,
  },
  prefLabel: {
    ...Club.type.body,
    color: Club.colors.textPrimary,
  },
  modalScrim: {
    flex: 1,
    backgroundColor: Club.colors.heroDim,
    justifyContent: "center",
    paddingHorizontal: Club.space.gutter,
  },
  modalCard: {
    backgroundColor: Club.colors.surfaceCard,
    borderRadius: Club.radius.panel,
    padding: Club.space.lg,
    gap: Club.space.md,
  },
  modalTitle: {
    ...Club.type.title,
    color: Club.colors.textPrimary,
  },
  modalBody: {
    ...Club.type.bodySm,
    color: Club.colors.textSecondary,
  },
  cancelHit: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  cancel: {
    ...Club.type.body,
    color: Club.colors.textSecondary,
  },
});
