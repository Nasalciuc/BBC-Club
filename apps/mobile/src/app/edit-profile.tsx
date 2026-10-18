import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BackButton, StateMessage, tokens, rn } from "@bbc/ui";

import { ListRow } from "@/components/list-row";
import { RootTabBar } from "@/components/RootTabBar";
import { ScreenStatusBar } from "@/components/screen-status-bar";
import { CabinSheet } from "@/features/profile/CabinSheet";
import { HomeAirportSheet } from "@/features/profile/HomeAirportSheet";
import { mergeSavedProfile, type SavedProfile } from "@/features/profile/notifications-logic";
import { TravelersSheet } from "@/features/profile/TravelersSheet";
import type { ProfileSheetHandle } from "@/features/profile/types";
import { airportByCode } from "@/lib/airport-by-code";
import { homeAirportLabel } from "@/lib/airport-search-state";
import { fetchProfile, type Profile } from "@/lib/api";
import { readFailureCopy, stateCopy } from "@/lib/error-context";

function travelersLabel(prefs: Profile["preferences"] | undefined): string {
  const n = prefs?.passengers?.adult ?? 1;
  return n === 1 ? "1 adult" : `${n} adults`;
}

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<Profile | null>(null);
  // The rows wait for the profile (ADR-IMPL-047): dimmed and without a value while it loads, never a value made up
  // ("Not set", "Business", "1 adult") — and a profile that did not load takes their place, with `Try again`.
  const [loadFailure, setLoadFailure] = useState<{ title: string; body: string } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  // Figma 479:8296 names the home airport's city: `JFK · New York`.
  const [homeCity, setHomeCity] = useState<{ code: string; city: string } | null>(null);
  const homeAirportRef = useRef<ProfileSheetHandle>(null);
  const cabinRef = useRef<ProfileSheetHandle>(null);
  const travelersRef = useRef<ProfileSheetHandle>(null);

  useEffect(() => {
    void (async () => {
      const result = await fetchProfile();
      if (!result.ok) {
        setLoadFailure(readFailureCopy(result.code, "profile"));
        return;
      }
      setLoadFailure(null);
      setProfile(result.data);
    })().catch(() => setLoadFailure(stateCopy("route")));
  }, [reloadToken]);

  const homeAirport = profile?.homeAirport ?? null;
  useEffect(() => {
    if (!homeAirport) return;
    let cancelled = false;
    void (async () => {
      const airport = await airportByCode(homeAirport);
      if (!cancelled && airport) setHomeCity({ code: airport.code, city: airport.city });
    })();
    return () => {
      cancelled = true;
    };
  }, [homeAirport]);

  function onSheetSaved(next: SavedProfile) {
    setProfile((prev) => (prev ? mergeSavedProfile(prev, next) : prev));
  }

  const cabinLabel = profile ? (profile.preferences?.cabin === "first" ? "First" : "Business") : undefined;
  // The city shown is always the one of the airport shown — never the previous airport's while the new one resolves.
  const city = homeAirport && homeCity?.code === homeAirport ? homeCity.city : null;

  return (
    // Figma 479:8296: the back button stays at the safe area; the page scrolls under it, 20 pt lower, and stops 16 pt
    // above the tab bar.
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenStatusBar on="light" />
      <View style={styles.top}>
        <BackButton testID="editProfile.back" onPress={() => router.back()} />
      </View>
      <ScrollView testID="editProfile.root" style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          Edit profile
        </Text>
        {!profile && loadFailure ? (
          <StateMessage
            testID="editProfile.error"
            variant="error"
            title={loadFailure.title}
            body={loadFailure.body}
            primary={{
              label: "Try again",
              testID: "editProfile.error.retry",
              // The rows come back, dimmed, while it loads again: never the old failure on screen.
              onPress: () => {
                setLoadFailure(null);
                setReloadToken((n) => n + 1);
              },
            }}
          />
        ) : (
          <>
            <ListRow
              testID="editProfile.homeAirport"
              label="Home airport"
              size="sm"
              value={profile ? (homeAirport ? homeAirportLabel(homeAirport, city) : "Not set") : undefined}
              disabled={!profile}
              onPress={() => homeAirportRef.current?.present()}
            />
            <ListRow
              testID="editProfile.cabin"
              label="Cabin"
              size="sm"
              value={cabinLabel}
              disabled={!profile}
              onPress={() => cabinRef.current?.present()}
            />
            <ListRow
              testID="editProfile.travelers"
              label="Travelers"
              size="sm"
              value={profile ? travelersLabel(profile.preferences) : undefined}
              disabled={!profile}
              onPress={() => travelersRef.current?.present()}
            />
          </>
        )}
      </ScrollView>
      <RootTabBar active="profile" />
      {profile ? (
        <>
          <HomeAirportSheet ref={homeAirportRef} profile={profile} homeCity={city} onSaved={onSheetSaved} />
          <CabinSheet ref={cabinRef} profile={profile} onSaved={onSheetSaved} />
          <TravelersSheet ref={travelersRef} profile={profile} onSaved={onSheetSaved} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  top: { paddingHorizontal: tokens.space.lg },
  scroll: { flex: 1, marginTop: 20, marginBottom: tokens.space.md },
  // Figma 479:8299: the title and the rows 24 pt apart, 8 pt into the scroll.
  content: {
    paddingTop: tokens.space.xs,
    paddingHorizontal: tokens.space.lg,
    paddingBottom: tokens.space.lg,
    gap: tokens.space.lg,
  },
  title: { ...rn(tokens.type.display), color: tokens.colors.textPrimary },
});
