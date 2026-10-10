import { useIsFocused, useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RequestVM } from "@bbc/shared/api/v1/requests";
import { EmptyState, Icon, ListRow, RequestCard, tokens, rn } from "@bbc/ui";

import { telHref } from "@/features/requests/confirmation-logic";
import { requestCard } from "@/features/requests/request-card";
import { recentRequests } from "@/features/requests/request-view-logic";
import { fetchProfile, fetchRequests, type Profile } from "@/lib/api";
import { env } from "@/lib/env";
import { displayPhone } from "@/lib/phone";
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
  const focused = useIsFocused();

  // Each time Profile comes into view: a new request, a state the specialist changed, a phone edited in Settings show
  // at once. The spinner is for the first load only; later loads keep what is on screen.
  useEffect(() => {
    if (!focused) return;
    let cancelled = false;
    void (async () => {
      const [profileResult, requestsResult] = await Promise.all([fetchProfile(), fetchRequests()]);
      if (cancelled) return;
      setLoading(false);
      if (!profileResult.ok) {
        setError(profileResult.message);
        return;
      }
      setError(null);
      setProfile(profileResult.data);
      if (requestsResult.ok) setRecent(recentRequests(requestsResult.data.items));
    })().catch(() => {
      if (!cancelled) {
        setError("Something went wrong.");
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [focused]);

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
        <Text style={styles.kicker} accessibilityRole="header">
          Your profile.
        </Text>
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
          onPress={() => {
            Linking.openURL(call).catch(() => undefined);
          }}
          style={({ pressed }) => [styles.call, pressed && styles.pressed]}
        >
          <Text style={styles.callText}>Call us</Text>
        </Pressable>
      ) : null}
      {/* Requests that did not load are left out, title included — the next visit tries again. */}
      {recent === null ? null : (
        <Text style={[styles.section, styles.afterCard]} accessibilityRole="header">
          Recent requests
        </Text>
      )}
      {recent === null ? null : recent.length === 0 ? (
        // Figma 233:4550 (P5 / Profile · New client).
        <EmptyState
          testID="profile.requests.empty"
          title="No requests yet."
          body="Explore destinations and request a fare. Your requests will appear here."
          primary={{ label: "Explore", onPress: () => router.push("/(tabs)/explore" as Href) }}
        />
      ) : (
        // Figma 233:4453: the compact request card, 12 pt apart.
        <View style={styles.cards}>
          {recent.map((item) => {
            const card = requestCard(item);
            return (
              <RequestCard
                key={item.id}
                size="compact"
                testID={`profile.request.${item.id}`}
                title={card.title}
                facts={card.facts}
                when={card.when}
                badgeStatus={card.badge}
                accessibilityLabel={card.spoken}
                onPress={() => router.push(`/request/${item.id}` as Href)}
              />
            );
          })}
        </View>
      )}
      <Text
        style={[styles.section, styles.accountTitle, recent === null && styles.afterCard]}
        accessibilityRole="header"
      >
        Your account.
      </Text>
      <ListRow
        testID="profile.account.phone"
        label="Phone"
        // Figma 233:4453: `+1 (212) 555-0148`, as the request's detail writes it; none (or blank) asks for one.
        value={displayPhone(profile?.phone) ?? "Add phone"}
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
  // A message is `text-secondary`, never `status-danger` (DESIGN.md: that is for a field at fault only).
  error: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary, marginBottom: tokens.space.sm },
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
  // Figma 233:4453: `Recent requests` and `Your account.` are serif titles, 24 pt from what they introduce.
  section: {
    ...rn(tokens.type.title),
    color: tokens.colors.textPrimary,
    marginTop: tokens.space.lg,
    marginBottom: tokens.space.lg,
  },
  // The card and `Call us` above already leave 24 pt (Figma 233:4453: one 24 pt gap, not two) — under the recent
  // requests' title, or under `Your account.` when the recent requests did not load.
  afterCard: { marginTop: 0 },
  accountTitle: { marginBottom: tokens.space.xs },
  cards: { gap: tokens.space.sm },
  since: { ...rn(tokens.type.caption), color: tokens.colors.textTertiary, marginTop: tokens.space.sm },
  pressed: { opacity: 0.7 },
});
