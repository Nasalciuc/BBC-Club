import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BackButton, tokens, rn } from "@bbc/ui";

import { ListRow } from "@/components/list-row";
import { CabinSheet } from "@/features/profile/CabinSheet";
import { HomeAirportSheet } from "@/features/profile/HomeAirportSheet";
import { mergeSavedProfile, type SavedProfile } from "@/features/profile/notifications-logic";
import { TravelersSheet } from "@/features/profile/TravelersSheet";
import type { ProfileSheetHandle } from "@/features/profile/types";
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

  function onSheetSaved(next: SavedProfile) {
    setProfile((prev) => (prev ? mergeSavedProfile(prev, next) : prev));
    setError(null);
  }

  const cabinLabel = profile?.preferences?.cabin === "first" ? "First" : "Business";

  return (
    <View style={styles.root}>
      <ScrollView
        testID="editProfile.root"
        contentContainerStyle={{
          paddingTop: insets.top + tokens.space.sm,
          paddingHorizontal: tokens.space.lg,
          paddingBottom: insets.bottom + tokens.space.xxl,
        }}
      >
        <BackButton testID="editProfile.back" onPress={() => router.back()} />
        <Text style={styles.title}>Edit profile</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <ListRow
          testID="editProfile.homeAirport"
          label="Home airport"
          value={profile?.homeAirport ?? "Not set"}
          onPress={() => homeAirportRef.current?.present()}
        />
        <ListRow
          testID="editProfile.cabin"
          label="Cabin"
          value={cabinLabel}
          onPress={() => cabinRef.current?.present()}
        />
        <ListRow
          testID="editProfile.travelers"
          label="Travelers"
          value={travelersLabel(profile?.preferences)}
          onPress={() => travelersRef.current?.present()}
        />
      </ScrollView>
      {profile ? (
        <>
          <HomeAirportSheet ref={homeAirportRef} profile={profile} onSaved={onSheetSaved} />
          <CabinSheet ref={cabinRef} profile={profile} onSaved={onSheetSaved} />
          <TravelersSheet ref={travelersRef} profile={profile} onSaved={onSheetSaved} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  title: { ...rn(tokens.type.display), color: tokens.colors.textPrimary, marginBottom: tokens.space.lg },
  error: { ...rn(tokens.type.bodySm), color: tokens.colors.statusDanger, marginBottom: tokens.space.sm },
});
