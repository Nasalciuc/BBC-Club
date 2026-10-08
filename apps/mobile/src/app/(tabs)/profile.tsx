import { useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RequestVM } from "@bbc/shared/api/v1/requests";
import { EmptyState, Icon, ListRow, RequestRow, tokens, rn } from "@bbc/ui";

import { telHref } from "@/features/requests/confirmation-logic";
import { badgeStatus, requestMeta } from "@/features/requests/status";
import { fetchProfile, fetchRequests, type Profile } from "@/lib/api";
import { env } from "@/lib/env";
import { clientSince } from "@/features/profile/profile-logic";
import { monogram } from "@/lib/monogram";

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<Profile | null>(null);
  // Null until the requests answered: a failed fetch must not read as "No requests yet." (Figma 233:4550 is for a new
  // client, not for an error).
  const [recent, setRecent] = useState<RequestVM[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [profileResult, requestsResult] = await Promise.all([fetchProfile(), fetchRequests()]);
      if (!profileResult.ok) {
        setError(profileResult.message);
        setLoading(false);
        return;
      }
      setProfile(profileResult.data);
      if (requestsResult.ok) setRecent(requestsResult.data.items.slice(0, 3));
      setLoading(false);
    })().catch(() => {
      setError("Something went wrong.");
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={tokens.colors.primary} />
      </View>
    );
  }

  const displayName = profile?.displayName?.trim() || "Member";
  const initials = monogram(profile?.displayName);
  const call = telHref(env.EXPO_PUBLIC_SUPPORT_PHONE);
  const home = profile?.homeAirport;
  const since = clientSince(profile?.memberSince);

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
      <View style={styles.top}>
        <Text style={styles.kicker}>Your profile.</Text>
        <Pressable
          testID="profile.settings"
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => router.push("/settings" as Href)}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Icon name="settings" size={24} color={tokens.colors.textPrimary} />
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.card}>
        <View style={styles.monogram}>
          <Text style={styles.monogramText}>{initials || "·"}</Text>
        </View>
        <Text style={styles.name}>{displayName}</Text>
        {home ? <Text style={styles.flies}>{`Flies from ${home}`}</Text> : null}
        <Pressable
          testID="profile.edit"
          accessibilityRole="button"
          onPress={() => router.push("/edit-profile" as Href)}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={styles.edit}>Edit</Text>
        </Pressable>
      </View>
      {call ? (
        <Pressable
          testID="profile.call"
          accessibilityRole="button"
          onPress={() => void Linking.openURL(call)}
          style={({ pressed }) => [styles.call, pressed && styles.pressed]}
        >
          <Text style={styles.callText}>Call us</Text>
        </Pressable>
      ) : null}
      <Text style={styles.section}>Recent requests</Text>
      {recent === null ? null : recent.length === 0 ? (
        // Figma 233:4550 (P5 / Profile · New client).
        <EmptyState
          testID="profile.requests.empty"
          title="No requests yet."
          body="Explore destinations and request a fare. Your requests will appear here."
          primary={{ label: "Explore", onPress: () => router.push("/(tabs)/explore" as Href) }}
        />
      ) : (
        recent.map((item) => (
          <RequestRow
            key={item.id}
            testID={`profile.request.${item.id}`}
            route={item.route}
            meta={requestMeta(item)}
            badgeStatus={badgeStatus(item.status)}
            onPress={() => router.push(`/request/${item.id}` as Href)}
          />
        ))
      )}
      <Text style={styles.section}>Your account.</Text>
      <ListRow
        testID="profile.account.phone"
        label="Phone"
        value={profile?.phone ?? "Add phone"}
        onPress={() => router.push("/settings" as Href)}
      />
      {since ? <Text style={styles.since}>{since}</Text> : null}
      {!since && profile?.email ? <Text style={styles.since}>{profile.email}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  centered: { alignItems: "center", justifyContent: "center" },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: tokens.space.lg,
  },
  kicker: { ...rn(tokens.type.display), color: tokens.colors.textPrimary },
  error: { ...rn(tokens.type.bodySm), color: tokens.colors.statusDanger, marginBottom: tokens.space.sm },
  card: {
    backgroundColor: tokens.colors.surfaceCard,
    borderRadius: tokens.radius.card,
    padding: tokens.space.lg,
    alignItems: "flex-start",
    gap: tokens.space.xs,
    marginBottom: tokens.space.lg,
  },
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
  flies: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
  edit: { ...rn(tokens.type.body), color: tokens.colors.primary },
  call: { marginBottom: tokens.space.lg },
  callText: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
  section: {
    ...rn(tokens.type.labelMono),
    color: tokens.colors.textSecondary,
    marginTop: tokens.space.lg,
    marginBottom: tokens.space.sm,
  },
  since: { ...rn(tokens.type.caption), color: tokens.colors.textTertiary, marginTop: tokens.space.sm },
  pressed: { opacity: 0.7 },
});
