import { useIsFocused, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RequestVM } from "@bbc/shared/api/v1/requests";
import {
  Button,
  CarouselRow,
  ListRow,
  PhotoCredit,
  ProfileHero,
  RoundButton,
  RowGroup,
  SectionHeader,
  Skeleton,
  StateMessage,
  TripPhotoCard,
  profileBandHeight,
  tokens,
  rn,
} from "@bbc/ui";

import { ScreenStatusBar } from "@/components/screen-status-bar";
import { Club } from "@/constants/club";
import { bandPicture, cardPicture } from "@/features/places/place-photo-logic";
import { CLUB_PICTURE, PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";
import { CabinSheet } from "@/features/profile/CabinSheet";
import { DeleteAccountSheet } from "@/features/profile/DeleteAccountSheet";
import { HomeAirportSheet } from "@/features/profile/HomeAirportSheet";
import {
  mergeSavedProfile,
  offersSwitchValue,
  withOffers,
  type SavedProfile,
} from "@/features/profile/notifications-logic";
import { NotificationsSheet } from "@/features/profile/NotificationsSheet";
import { PasswordSheet } from "@/features/profile/PasswordSheet";
import { PhoneSheet } from "@/features/profile/PhoneSheet";
import { cabinLabel, profileStats, travelersLabel } from "@/features/profile/profile-logic";
import { TravelersSheet } from "@/features/profile/TravelersSheet";
import type { ProfileSheetHandle } from "@/features/profile/types";
import { useSignOut } from "@/features/profile/useSignOut";
import { telHref } from "@/features/requests/confirmation-logic";
import { requestCard } from "@/features/requests/request-card";
import { recentRequests } from "@/features/requests/request-view-logic";
import { isOpen } from "@/features/requests/status";
import { airportByCode } from "@/lib/airport-by-code";
import { homeAirportLabel } from "@/lib/airport-search-state";
import { fetchProfile, fetchRequests, type Profile } from "@/lib/api";
import { env } from "@/lib/env";
import { readFailureCopy, stateCopy } from "@/lib/error-context";
import { monogram } from "@/lib/monogram";
import { displayPhone } from "@/lib/phone";

type Requests = { items: RequestVM[]; hasMore: boolean };

/** ProfileHero's portrait rests two thirds on the photograph (80 of its 120 pt): its skeleton does the same. */
const AVATAR_OVER = 80;

/**
 * Profile (12): the home city's photograph with the member's portrait over its foot, their name and where they fly
 * from; their trips and open requests; `Edit profile` and `Call us`; `My trips`; their travel preferences and phone,
 * notifications and password, `Delete account` and `Sign out`. The round button over the photograph opens Settings,
 * where the privacy policy and the terms are (ADR-IMPL-055 §9).
 */
export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [profile, setProfile] = useState<Profile | null>(null);
  // Null until the requests answered: requests that did not load are left out, never shown as none.
  const [requests, setRequests] = useState<Requests | null>(null);
  const [loading, setLoading] = useState(true);
  // A profile that never loaded is said as such, with `Try again` — never a made-up "Member" page (ADR-IMPL-047). A
  // later load that fails keeps the page on screen: Profile asks again each time it comes into view.
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  // 12 names the home airport's city: `New York (JFK)`.
  const [homeCity, setHomeCity] = useState<{ code: string; city: string } | null>(null);
  const [pastHero, setPastHero] = useState(false);
  const focused = useIsFocused();
  const { signingOut, failure: signOutFailure, signOutNow } = useSignOut();
  const homeAirportRef = useRef<ProfileSheetHandle>(null);
  const cabinRef = useRef<ProfileSheetHandle>(null);
  const travelersRef = useRef<ProfileSheetHandle>(null);
  const phoneRef = useRef<ProfileSheetHandle>(null);
  const notificationsRef = useRef<ProfileSheetHandle>(null);
  const passwordRef = useRef<ProfileSheetHandle>(null);
  const deleteRef = useRef<ProfileSheetHandle>(null);
  // Each save a sheet answered: a load that began before it brings back the profile as it was, and is not shown.
  const saves = useRef(0);
  const home = profile?.homeAirport ?? null;
  const trips = requests ? recentRequests(requests.items) : [];
  const tripCards = trips.map((r) => ({ id: r.id, card: requestCard(r) }));
  // ADR-IMPL-043: the home airport's city, and each trip's destination.
  const photoFor = usePlacePhotos([home, ...tripCards.map((t) => t.card.to)]);

  // Each time Profile comes into view: a new request, a state the specialist changed, a phone edited in Settings show
  // at once. The skeleton is for the first load only; later loads keep what is on screen.
  useEffect(() => {
    if (!focused) return;
    let cancelled = false;
    const savesBefore = saves.current;
    void (async () => {
      const [profileResult, requestsResult] = await Promise.all([fetchProfile(), fetchRequests()]);
      if (cancelled) return;
      setLoading(false);
      if (!profileResult.ok) {
        setError(readFailureCopy(profileResult.code, "profile"));
        return;
      }
      setError(null);
      // A sheet saved while this was asked: its answer is newer than this one.
      if (saves.current === savesBefore) setProfile(profileResult.data);
      if (requestsResult.ok) setRequests({ items: requestsResult.data.items, hasMore: requestsResult.data.hasMore });
    })().catch(() => {
      if (!cancelled) {
        setError(stateCopy("route"));
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [focused, reloadToken]);

  useEffect(() => {
    if (!home) return;
    let cancelled = false;
    void (async () => {
      const airport = await airportByCode(home);
      if (!cancelled && airport) setHomeCity({ code: airport.code, city: airport.city });
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [home]);

  const band = profileBandHeight(insets.top);
  const settingsButton = (
    <RoundButton
      testID="profile.settings"
      icon="settings"
      accessibilityLabel="Settings"
      onPress={() => router.push("/settings" as Href)}
    />
  );

  if (loading) {
    return (
      <View style={styles.root} testID="profile.loading">
        {/* The band is light tint until the photograph comes: dark glyphs over it. */}
        <ScreenStatusBar on="light" />
        <View style={[styles.bandPlaceholder, { height: band }]} />
        <View style={styles.loadingIdentity}>
          <Skeleton width={120} height={120} radius="pill" />
          <Skeleton width="50%" height={30} radius="pill" />
          <Skeleton width="30%" height={18} radius="pill" />
        </View>
        <View style={styles.content}>
          <Skeleton height={52} radius="pill" />
          <Skeleton height={168} radius="md" />
        </View>
      </View>
    );
  }

  if (!profile && error) {
    // The settings button stays: Settings keeps Sign out and Delete account, and a profile that keeps failing must not
    // take them away (ADR-IMPL-047).
    return (
      <View testID="profile.root" style={styles.root}>
        <ScreenStatusBar on="light" />
        <View style={[styles.bandPlaceholder, { height: band }]}>
          <View style={[styles.bandAction, { top: insets.top + tokens.space.xs }]}>{settingsButton}</View>
        </View>
        <View style={styles.content}>
          <StateMessage
            testID="profile.error"
            title={error.title}
            body={error.body}
            primary={{
              label: "Try again",
              testID: "profile.error.retry",
              // The message leaves at once: the page waits for the new answer, never with the old failure on it.
              onPress: () => {
                setError(null);
                setLoading(true);
                setReloadToken((n) => n + 1);
              },
            }}
          />
        </View>
      </View>
    );
  }

  const displayName = profile?.displayName?.trim() || "Member";
  const call = telHref(env.EXPO_PUBLIC_SUPPORT_PHONE);
  const city = home && homeCity?.code === home ? homeCity.city : null;
  // A satellite view is drawn at the band's size: the column (capped on large phones) by the band's height.
  const picture = bandPicture(null, photoFor(home), {
    headers: PICTURE_HEADERS,
    mapboxToken: env.EXPO_PUBLIC_MAPBOX_TOKEN,
    size: { width: Math.min(width, Club.layout.phoneMaxWidth), height: band },
  });
  const credit = picture.credit;
  const creditLink = credit?.link ?? null;
  const stats = requests ? profileStats(requests.items, requests.hasMore) : null;
  const openRequests = requests ? requests.items.filter((r) => isOpen(r.status)).length : null;
  const ready = profile !== null;

  function onSheetSaved(next: SavedProfile) {
    saves.current += 1;
    setProfile((prev) => (prev ? mergeSavedProfile(prev, next) : prev));
  }

  return (
    <View style={styles.root}>
      {/* Light glyphs over the photograph; dark ones once the page has scrolled past it. */}
      <ScreenStatusBar on={pastHero ? "light" : "dark"} />
      <ScrollView
        testID="profile.root"
        contentContainerStyle={styles.scroll}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const past = e.nativeEvent.contentOffset.y > band - insets.top;
          if (past !== pastHero) setPastHero(past);
        }}
      >
        <ProfileHero
          testID="profile.hero"
          name={displayName}
          initials={monogram(profile?.displayName)}
          home={home ? `Flies from ${home}` : null}
          image={picture.source}
          fallback={CLUB_PICTURE}
          cachePolicy={picture.cache}
          topInset={insets.top}
          action={settingsButton}
        />
        <View style={styles.content}>
          {stats ? (
            // 12: two numbers the club has; the saved count is left out (ADR-IMPL-055 §7).
            <View style={styles.stats} testID="profile.stats">
              <Stat value={stats.trips} label="Trips" />
              <View style={styles.statRule} />
              <Stat value={stats.open} label="Open requests" />
            </View>
          ) : null}
          {/* 12: Edit profile, the one filled pill, and Call us beside it. */}
          <View style={styles.actions}>
            <View style={styles.action}>
              <Button
                testID="profile.edit"
                label="Edit profile"
                icon="user-pen"
                variant="primary"
                size="md"
                onPress={() => router.push("/edit-profile" as Href)}
              />
            </View>
            {call ? (
              <View style={styles.action}>
                <Button
                  testID="profile.call"
                  label="Call us"
                  icon="phone"
                  variant="outline"
                  size="md"
                  onPress={() => {
                    Linking.openURL(call).catch(() => undefined);
                  }}
                />
              </View>
            ) : null}
          </View>

          {tripCards.length > 0 ? (
            <View style={styles.trips}>
              <SectionHeader
                title="My trips"
                action={{
                  label: "See all",
                  chevron: true,
                  testID: "profile.trips.seeAll",
                  onPress: () => router.push("/(tabs)/requests" as Href),
                }}
              />
              <CarouselRow testID="profile.trips">
                {tripCards.map(({ id, card }) => (
                  <TripPhotoCard
                    key={id}
                    testID={`profile.request.${id}`}
                    photo={cardPicture(null, photoFor(card.to), PICTURE_HEADERS)}
                    fallback={CLUB_PICTURE}
                    city={card.city}
                    dates={card.dates}
                    route={card.route}
                    accessibilityLabel={card.spoken}
                    onPress={() => router.push(`/request/${id}` as Href)}
                  />
                ))}
              </CarouselRow>
            </View>
          ) : null}

          <RowGroup testID="profile.travel">
            <ListRow
              testID="profile.homeAirport"
              icon="plane"
              label="Home airport"
              value={home ? homeAirportLabel(home, city) : "Not set"}
              disabled={!ready}
              onPress={() => homeAirportRef.current?.present()}
            />
            <ListRow
              testID="profile.cabin"
              icon="seat"
              label="Cabin"
              value={cabinLabel(profile?.preferences)}
              disabled={!ready}
              onPress={() => cabinRef.current?.present()}
            />
            <ListRow
              testID="profile.travelers"
              icon="users"
              label="Travelers"
              value={travelersLabel(profile?.preferences)}
              disabled={!ready}
              onPress={() => travelersRef.current?.present()}
            />
            <ListRow
              testID="profile.account.phone"
              icon="phone"
              label="Phone"
              // 12: `+1 212 555 0142`, as the request's detail writes it; none asks for one.
              value={displayPhone(profile?.phone) ?? "Add phone"}
              disabled={!ready}
              onPress={() => phoneRef.current?.present()}
            />
          </RowGroup>
          <RowGroup testID="profile.account">
            <ListRow
              testID="profile.notifications"
              icon="bell"
              label="Notifications"
              disabled={!ready}
              onPress={() => notificationsRef.current?.present()}
            />
            <ListRow
              testID="profile.password"
              icon="lock"
              label="Password"
              disabled={!ready}
              onPress={() => passwordRef.current?.present()}
            />
          </RowGroup>
          <ListRow
            testID="profile.delete"
            icon="trash"
            label="Delete account"
            danger
            onPress={() => deleteRef.current?.present()}
          />
          <Button
            testID="profile.signOut"
            label={signingOut ? "Signing out…" : "Sign out"}
            variant="destructive"
            busy={signingOut}
            onPress={signOutNow}
          />
          {signOutFailure ? <Text style={styles.message}>{signOutFailure}</Text> : null}
          {credit ? (
            // The credit the photograph owes (ADR-IMPL-043).
            <PhotoCredit
              testID="profile.photoCredit"
              label={credit.label}
              accessibilityLabel={credit.spoken}
              onPress={
                creditLink
                  ? () => {
                      Linking.openURL(creditLink).catch(() => undefined);
                    }
                  : undefined
              }
            />
          ) : null}
        </View>
      </ScrollView>
      {profile ? (
        <>
          <HomeAirportSheet ref={homeAirportRef} profile={profile} homeCity={city} onSaved={onSheetSaved} />
          <CabinSheet ref={cabinRef} profile={profile} onSaved={onSheetSaved} />
          <TravelersSheet ref={travelersRef} profile={profile} onSaved={onSheetSaved} />
          <PhoneSheet ref={phoneRef} profile={profile} onSaved={onSheetSaved} />
          <PasswordSheet ref={passwordRef} profile={profile} onSaved={onSheetSaved} />
          <NotificationsSheet
            ref={notificationsRef}
            savedOffers={offersSwitchValue(profile)}
            onSaved={(offers) => {
              saves.current += 1;
              setProfile((prev) => (prev ? withOffers(prev, offers) : prev));
            }}
          />
        </>
      ) : null}
      <DeleteAccountSheet ref={deleteRef} openRequests={openRequests} onDeleted={() => router.replace("/join")} />
    </View>
  );
}

/** 12: a number in `title-sm` over its name in slate. */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${value} ${label}`}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  scroll: { paddingBottom: tokens.space.xl },
  bandPlaceholder: { backgroundColor: tokens.colors.surfaceTint },
  bandAction: { position: "absolute", right: tokens.space.gutter },
  loadingIdentity: { alignItems: "center", gap: tokens.space.sm, marginTop: -AVATAR_OVER },
  content: { paddingHorizontal: tokens.space.gutter, paddingTop: tokens.space.lg, gap: tokens.space.md },
  // 12: the two numbers centred, a rule between them.
  stats: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statRule: { width: StyleSheet.hairlineWidth * 2, alignSelf: "stretch", backgroundColor: tokens.colors.borderDefault },
  statValue: { ...rn(tokens.type.titleSm), color: tokens.colors.textPrimary },
  statLabel: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  actions: { flexDirection: "row", gap: tokens.space.sm, marginTop: tokens.space.xs },
  action: { flex: 1 },
  trips: { gap: tokens.space.sm, marginTop: tokens.space.xs },
  // A message is `text-secondary`, never `status-danger` (DESIGN.md: that is for a field at fault only).
  message: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary, textAlign: "center" },
});
