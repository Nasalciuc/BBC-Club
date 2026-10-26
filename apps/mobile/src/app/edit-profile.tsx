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
import { photoActions, photoRowValue } from "@/features/profile/photo-logic";
import { photoPickerReady } from "@/features/profile/photo-native";
import { PhotoSheet } from "@/features/profile/PhotoSheet";
import { cabinLabel, travelersLabel } from "@/features/profile/profile-logic";
import { profileCopy } from "@/features/profile/profile-save-logic";
import { TravelersSheet } from "@/features/profile/TravelersSheet";
import type { ProfileSheetHandle } from "@/features/profile/types";
import { airportByCode } from "@/lib/airport-by-code";
import { homeAirportLabel } from "@/lib/airport-search-state";
import { fetchProfile, type Profile } from "@/lib/api";
import { readFailureCopy, stateCopy } from "@/lib/error-context";

/**
 * Edit profile (36): the member's own name (brief 3.4.1 — 36 draws no `Name` row; it comes first, in 36's look) and
 * their photo (brief 3.4.2 — no `Photo` row either; under the name, on a build that has the photo picker: an update over
 * the air on an older binary shows the row only to remove a photo added elsewhere, ADR-IMPL-070), then the home airport, the cabin and the travelers a
 * search and a request start from.
 */
export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<Profile | null>(null);
  // Each sheet's save is this page's and every screen's at once — Explore's greeting, Profile's name
  // (profile-save-logic).
  const [copy] = useState(() => profileCopy(setProfile));
  // The rows wait for the profile (ADR-IMPL-047): dimmed and without a value while it loads, never a value made up
  // ("Not set", "Business", "1 adult") — and a profile that did not load takes their place, with `Try again`.
  const [loadFailure, setLoadFailure] = useState<{ title: string; body: string } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  // 36 names the home airport's city: `New York (JFK)`.
  const [homeCity, setHomeCity] = useState<{ code: string; city: string } | null>(null);
  const nameRef = useRef<ProfileSheetHandle>(null);
  const photoRef = useRef<ProfileSheetHandle>(null);
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

  // The city shown is always the one of the airport shown — never the previous airport's while the new one resolves.
  const city = homeAirport && homeCity?.code === homeAirport ? homeCity.city : null;
  // The Photo row and its sheet: where the picker is, or where there is a photo to remove (it needs no native module).
  const photo = photoActions(photoPickerReady, Boolean(profile?.photo));

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
            {photo.row ? (
              <ListRow
                testID="editProfile.photo"
                icon="camera-fill"
                label="Photo"
                value={profile ? photoRowValue(profile) : undefined}
                disabled={!profile}
                onPress={() => photoRef.current?.present()}
              />
            ) : null}
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
          <NameSheet ref={nameRef} profile={profile} onSaved={copy.saved} />
          {photo.row ? <PhotoSheet ref={photoRef} profile={profile} onSaved={copy.saved} /> : null}
          <HomeAirportSheet ref={homeAirportRef} profile={profile} homeCity={city} onSaved={copy.saved} />
          <CabinSheet ref={cabinRef} profile={profile} onSaved={copy.saved} />
          <TravelersSheet ref={travelersRef} profile={profile} onSaved={copy.saved} />
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
