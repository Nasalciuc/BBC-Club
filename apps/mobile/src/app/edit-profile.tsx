import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ListRow, RowGroup, StateMessage, TopBar, tokens } from "@bbc/ui";

import { RootTabBar } from "@/components/RootTabBar";
import { ScreenStatusBar } from "@/components/screen-status-bar";
import { CabinSheet } from "@/features/profile/CabinSheet";
import { HomeAirportSheet } from "@/features/profile/HomeAirportSheet";
import { nameRowValue } from "@/features/profile/name-logic";
import { NameSheet } from "@/features/profile/NameSheet";
import { mergeSavedProfile, type SavedProfile } from "@/features/profile/notifications-logic";
import { cabinLabel, travelersLabel } from "@/features/profile/profile-logic";
import { storeSavedProfile } from "@/features/profile/profile-store";
import { TravelersSheet } from "@/features/profile/TravelersSheet";
import type { ProfileSheetHandle } from "@/features/profile/types";
import { airportByCode } from "@/lib/airport-by-code";
import { homeAirportLabel } from "@/lib/airport-search-state";
import { fetchProfile, type Profile } from "@/lib/api";
import { readFailureCopy, stateCopy } from "@/lib/error-context";

/**
 * Edit profile (36): the member's own name (brief 3.4.1 — 36 draws no `Name` row; it comes first, in 36's look), then
 * the home airport, the cabin and the travelers a search and a request start from.
 */
export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<Profile | null>(null);
  // The rows wait for the profile (ADR-IMPL-047): dimmed and without a value while it loads, never a value made up
  // ("Not set", "Business", "1 adult") — and a profile that did not load takes their place, with `Try again`.
  const [loadFailure, setLoadFailure] = useState<{ title: string; body: string } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  // 36 names the home airport's city: `New York (JFK)`.
  const [homeCity, setHomeCity] = useState<{ code: string; city: string } | null>(null);
  const nameRef = useRef<ProfileSheetHandle>(null);
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
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [homeAirport]);

  function onSheetSaved(next: SavedProfile) {
    setProfile((prev) => (prev ? mergeSavedProfile(prev, next) : prev));
    // Every screen shows the save at once — Explore's greeting, Profile's name — not on its next load (profile-store).
    storeSavedProfile(next);
  }

  // The city shown is always the one of the airport shown — never the previous airport's while the new one resolves.
  const city = homeAirport && homeCity?.code === homeAirport ? homeCity.city : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenStatusBar on="light" />
      {/* 36: the back chevron and the page's title beside it. */}
      <TopBar title="Edit profile" look="edit" onBack={() => router.back()} backTestID="editProfile.back" />
      <ScrollView testID="editProfile.root" style={styles.grow} contentContainerStyle={styles.content}>
        {!profile && loadFailure ? (
          <StateMessage
            testID="editProfile.error"
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
          <RowGroup testID="editProfile.rows" look="edit">
            <ListRow
              testID="editProfile.name"
              icon="user-fill"
              label="Name"
              value={profile ? nameRowValue(profile.displayName) : undefined}
              disabled={!profile}
              onPress={() => nameRef.current?.present()}
            />
            <ListRow
              testID="editProfile.homeAirport"
              icon="plane-right-fill"
              label="Home airport"
              value={profile ? (homeAirport ? homeAirportLabel(homeAirport, city) : "Not set") : undefined}
              disabled={!profile}
              onPress={() => homeAirportRef.current?.present()}
            />
            <ListRow
              testID="editProfile.cabin"
              icon="seat"
              label="Cabin"
              value={profile ? cabinLabel(profile.preferences) : undefined}
              disabled={!profile}
              onPress={() => cabinRef.current?.present()}
            />
            <ListRow
              testID="editProfile.travelers"
              icon="users-fill"
              label="Travelers"
              value={profile ? travelersLabel(profile.preferences) : undefined}
              disabled={!profile}
              onPress={() => travelersRef.current?.present()}
            />
          </RowGroup>
        )}
      </ScrollView>
      <RootTabBar active="profile" />
      {profile ? (
        <>
          <NameSheet ref={nameRef} profile={profile} onSaved={onSheetSaved} />
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
  grow: { flex: 1 },
  // 36: the rows' card 15 pt in, from under the top bar.
  content: { paddingLeft: 15, paddingRight: 15.2, paddingBottom: tokens.space.lg },
});
