import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BackButton, tokens, rn } from "@bbc/ui";

import { ListRow } from "@/components/list-row";
import { RootTabBar } from "@/components/RootTabBar";
import { CabinSheet } from "@/features/profile/CabinSheet";
import { HomeAirportSheet } from "@/features/profile/HomeAirportSheet";
import { mergeSavedProfile, type SavedProfile } from "@/features/profile/notifications-logic";
import { TravelersSheet } from "@/features/profile/TravelersSheet";
import type { ProfileSheetHandle } from "@/features/profile/types";
import { airportByCode } from "@/lib/airport-by-code";
import { homeAirportLabel } from "@/lib/airport-search-state";
import { fetchProfile, type Profile } from "@/lib/api";

function travelersLabel(prefs: Profile["preferences"] | undefined): string {
  const n = prefs?.passengers?.adult ?? 1;
  return n === 1 ? "1 adult" : `${n} adults`;
}

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Figma 479:8296 names the home airport's city: `JFK · New York`.
  const [homeCity, setHomeCity] = useState<{ code: string; city: string } | null>(null);
  const homeAirportRef = useRef<ProfileSheetHandle>(null);
  const cabinRef = useRef<ProfileSheetHandle>(null);
  const travelersRef = useRef<ProfileSheetHandle>(null);

  useEffect(() => {
    void (async () => {
      const result = await fetchProfile();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setProfile(result.data);
    })().catch(() => setError("Something went wrong."));
  }, []);

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
    setError(null);
  }

  const cabinLabel = profile?.preferences?.cabin === "first" ? "First" : "Business";
  // The city shown is always the one of the airport shown — never the previous airport's while the new one resolves.
  const city = homeAirport && homeCity?.code === homeAirport ? homeCity.city : null;

  return (
    // Figma 479:8296: the back button stays at the safe area; the page scrolls under it, 20 pt lower, and stops 16 pt
    // above the tab bar.
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.top}>
        <BackButton testID="editProfile.back" onPress={() => router.back()} />
      </View>
      <ScrollView testID="editProfile.root" style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          Edit profile
        </Text>
        {error ? <Text style={styles.message}>{error}</Text> : null}
        <ListRow
          testID="editProfile.homeAirport"
          label="Home airport"
          size="sm"
          value={homeAirport ? homeAirportLabel(homeAirport, city) : "Not set"}
          onPress={() => homeAirportRef.current?.present()}
        />
        <ListRow
          testID="editProfile.cabin"
          label="Cabin"
          size="sm"
          value={cabinLabel}
          onPress={() => cabinRef.current?.present()}
        />
        <ListRow
          testID="editProfile.travelers"
          label="Travelers"
          size="sm"
          value={travelersLabel(profile?.preferences)}
          onPress={() => travelersRef.current?.present()}
        />
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
  // A message is `text-secondary`, never `status-danger` (DESIGN.md: that is for a field at fault only).
  message: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
});
