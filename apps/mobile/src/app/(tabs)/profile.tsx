import { useIsFocused, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RequestVM } from "@bbc/shared/api/v1/requests";
import {
  Button,
  Icon,
  ListRow,
  PhotoCredit,
  ProfileHero,
  RoundButton,
  RowGroup,
  Skeleton,
  StateMessage,
  TripPhotoCard,
  baselineOffset,
  belowBaseline,
  hitSlopFor,
  profileBandHeight,
  tokens,
  rn,
} from "@bbc/ui";

import { ScreenStatusBar, heroImageKey, statusBarOn } from "@/components/screen-status-bar";
import { Club } from "@/constants/club";
import { clubPhoto, clubTripPhoto } from "@/features/places/club-photos";
import { bandPicture, cardPicture } from "@/features/places/place-photo-logic";
import { PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";
import { CabinSheet } from "@/features/profile/CabinSheet";
import { DeleteAccountSheet } from "@/features/profile/DeleteAccountSheet";
import { HomeAirportSheet } from "@/features/profile/HomeAirportSheet";
import { profileName } from "@/features/profile/name-logic";
import { offersSwitchValue, withOffers } from "@/features/profile/notifications-logic";
import { NotificationsSheet } from "@/features/profile/NotificationsSheet";
import { PasswordSheet } from "@/features/profile/PasswordSheet";
import { PhoneSheet } from "@/features/profile/PhoneSheet";
import { cabinLabel, openRequestsFor, profileStats, travelersLabel } from "@/features/profile/profile-logic";
import { profileCopy } from "@/features/profile/profile-save-logic";
import { TravelersSheet } from "@/features/profile/TravelersSheet";
import type { ProfileSheetHandle } from "@/features/profile/types";
import { useSignOut } from "@/features/profile/useSignOut";
import { useSaved } from "@/features/saved/saved";
import { telHref } from "@/features/requests/confirmation-logic";
import { requestCard } from "@/features/requests/request-card";
import { recentRequests } from "@/features/requests/request-view-logic";
import { airportByCode } from "@/lib/airport-by-code";
import { homeAirportLabel } from "@/lib/airport-search-state";
import { fetchProfile, fetchRequests, type Profile } from "@/lib/api";
import { env } from "@/lib/env";
import { errorFrameActions, readFailureCopy, stateCopy } from "@/lib/error-context";
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
  // The band's photograph as last drawn (or not), by which one it was: the status bar's glyphs follow it (F022).
  const [heroDrawn, setHeroDrawn] = useState<{ key: string | null; ok: boolean } | null>(null);
  const focused = useIsFocused();
  const { signingOut, failure: signOutFailure, signOutNow } = useSignOut();
  const saved = useSaved();
  const homeAirportRef = useRef<ProfileSheetHandle>(null);
  const cabinRef = useRef<ProfileSheetHandle>(null);
  const travelersRef = useRef<ProfileSheetHandle>(null);
  const phoneRef = useRef<ProfileSheetHandle>(null);
  const notificationsRef = useRef<ProfileSheetHandle>(null);
  const passwordRef = useRef<ProfileSheetHandle>(null);
  const deleteRef = useRef<ProfileSheetHandle>(null);
  // Each save a sheet answered — here, on Edit profile or in Settings — is this page's and every screen's at once; a
  // load that began before it brings back the profile as it was, and is not shown (profile-save-logic).
  const [copy] = useState(() => profileCopy(setProfile));
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
    const fresh = copy.loadBegun();
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
      if (fresh()) setProfile(profileResult.data);
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
  }, [focused, reloadToken, copy]);

  // A save made on Edit profile — the member's name above all — or in Settings shows here at once, not when Profile
  // next asks: never `Member` once a name exists (brief 3.4.1).
  useEffect(() => copy.follow(), [copy]);

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
  // 12 draws no button over the photograph; Settings keeps the privacy policy and the terms, which must stay reachable
  // (App Store 5.1.1, ADR-IMPL-055 §9): the glass button of 11, at the photograph's top right.
  const settingsButton = (
    <RoundButton
      testID="profile.settings"
      icon="settings"
      tone="glass"
      diameter={35}
      iconSize={19}
      strokeWidth={1.6}
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
    // take them away (ADR-IMPL-047). `Call us` beside `Try again` when the club's number is known (F114).
    const callUs = errorFrameActions("profile", env.EXPO_PUBLIC_SUPPORT_PHONE).includes("call")
      ? telHref(env.EXPO_PUBLIC_SUPPORT_PHONE)
      : null;
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
            secondary={
              callUs
                ? {
                    label: "Call us",
                    testID: "profile.error.call",
                    onPress: () => {
                      Linking.openURL(callUs).catch(() => undefined);
                    },
                  }
                : undefined
            }
          />
        </View>
      </View>
    );
  }

  // The name as saved; `Member` only while there is none (name-logic.ts says why it is not replaced).
  const displayName = profileName(profile?.displayName);
  const call = telHref(env.EXPO_PUBLIC_SUPPORT_PHONE);
  const city = home && homeCity?.code === home ? homeCity.city : null;
  // A satellite view is drawn at the band's size: the column (capped on large phones) by the band's height.
  const picture = bandPicture(null, photoFor(home), {
    headers: PICTURE_HEADERS,
    mapboxToken: env.EXPO_PUBLIC_MAPBOX_TOKEN,
    size: { width: Math.min(width, Club.layout.phoneMaxWidth), height: band },
  });
  const homePhoto = clubPhoto(home, "any");
  const heroImage = homePhoto ?? picture.source;
  const heroKey = heroImageKey(heroImage);
  const heroLoaded = heroDrawn !== null && heroDrawn.key === heroKey && heroDrawn.ok;
  const credit = homePhoto ? null : picture.credit;
  const creditLink = credit?.link ?? null;
  const stats = requests ? profileStats(requests.items, requests.hasMore) : null;
  // 12's third number: what the member saved on this phone (ADR-IMPL-056).
  const savedCount = saved.length;
  // What Delete account says it closes: `more` when the server's first page did not hold them all (F106).
  const openRequests = requests ? openRequestsFor(requests.items, requests.hasMore) : null;
  const ready = profile !== null;

  return (
    <View style={styles.root}>
      {/* Light glyphs over the photograph once it is drawn; dark ones over the tint band without one (no home airport,
          a city without a photograph, loading or failed), and once the page has scrolled past it (F022). */}
      <ScreenStatusBar on={statusBarOn({ hasImage: heroKey !== null, loaded: heroLoaded, pastHero })} />
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
          portrait={profile?.avatarUrl ? { uri: profile.avatarUrl } : null}
          home={home ? `Flies from ${home}` : null}
          image={heroImage}
          fallback={null}
          cachePolicy={homePhoto ? "disk" : picture.cache}
          onImageLoad={() => setHeroDrawn({ key: heroKey, ok: true })}
          onImageError={() => setHeroDrawn({ key: heroKey, ok: false })}
          topInset={insets.top}
          action={settingsButton}
        />
        {stats ? (
          // 12: three numbers over their names, two rules between them.
          <View style={styles.stats} testID="profile.stats">
            <Stat value={stats.trips} label="Trips" at={-121.3} />
            <View style={[styles.statRule, { marginLeft: -66.7 }]} />
            <Stat value={stats.open} label="Open requests" at={0} />
            <View style={[styles.statRule, { marginLeft: 66.9 }]} />
            <Stat value={String(savedCount)} label="Saved" at={120.3} />
          </View>
        ) : null}
        {/* 12: Edit profile, the one filled pill, and Call us beside it. */}
        <View style={[styles.actions, !stats && styles.actionsAlone]}>
          <View style={styles.action}>
            <Button
              testID="profile.edit"
              label="Edit profile"
              icon="user-pen-fill"
              iconSize={17.5}
              iconGap={11.8}
              variant="primary"
              height={PILL}
              text="profilePill"
              // 12 sets the mark and the words 4 pt right of the pill's middle.
              style={StyleSheet.flatten([styles.pill, { paddingLeft: 28, paddingRight: 20 }])}
              onPress={() => router.push("/edit-profile" as Href)}
            />
          </View>
          {call ? (
            <View style={styles.action}>
              <Button
                testID="profile.call"
                label="Call us"
                icon="phone-fill"
                iconSize={17.2}
                iconGap={11.8}
                variant="outline"
                height={PILL}
                text="profilePill"
                style={StyleSheet.flatten([styles.pill, { paddingLeft: 26, paddingRight: 22 }])}
                onPress={() => {
                  Linking.openURL(call).catch(() => undefined);
                }}
              />
            </View>
          ) : null}
        </View>

        {tripCards.length > 0 ? (
          <View>
            <View style={styles.tripsHead}>
              <Text style={styles.tripsTitle} accessibilityRole="header">
                My trips
              </Text>
              <Pressable
                testID="profile.trips.seeAll"
                accessibilityRole="button"
                accessibilityLabel="See all trips"
                hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}
                onPress={() => router.push("/(tabs)/requests" as Href)}
                style={({ pressed }) => [styles.seeAll, pressed && styles.pressed]}
              >
                <Text style={styles.seeAllText}>See all</Text>
                <Icon name="chevron" size={13.6} color={tokens.colors.textOnTint} strokeWidth={1.9} />
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tripsRow}
              testID="profile.trips"
            >
              {tripCards.map(({ id, card }) => {
                const own = clubTripPhoto(card.to);
                return (
                  <TripPhotoCard
                    key={id}
                    testID={`profile.request.${id}`}
                    photo={own?.source ?? cardPicture(null, photoFor(card.to), PICTURE_HEADERS)}
                    position={own ? { left: own.left, top: "50%" } : undefined}
                    fallback={null}
                    city={card.city}
                    dates={card.dates}
                    route={card.route}
                    accessibilityLabel={card.spoken}
                    onPress={() => router.push(`/request/${id}` as Href)}
                  />
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.rows}>
          <RowGroup testID="profile.travel" look="profile">
            <ListRow
              testID="profile.homeAirport"
              icon="plane-right-fill"
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
              icon="users-fill"
              label="Travelers"
              value={travelersLabel(profile?.preferences)}
              disabled={!ready}
              onPress={() => travelersRef.current?.present()}
            />
            <ListRow
              testID="profile.account.phone"
              icon="phone-fill"
              label="Phone"
              // 12: `+1 212 555 0142`, as the request's page writes it; none asks for one.
              value={displayPhone(profile?.phone) ?? "Add phone"}
              disabled={!ready}
              onPress={() => phoneRef.current?.present()}
            />
          </RowGroup>
          <View style={styles.cardGap}>
            <RowGroup testID="profile.account" look="profile" rowHeight={31.2}>
              <ListRow
                testID="profile.notifications"
                icon="bell"
                label="Notifications"
                disabled={!ready}
                onPress={() => notificationsRef.current?.present()}
              />
              <ListRow
                testID="profile.password"
                icon="lock-fill"
                label="Password"
                disabled={!ready}
                onPress={() => passwordRef.current?.present()}
              />
            </RowGroup>
          </View>
          {/* Each holder keeps its target's room in its padding (a touch lands only inside it), its margins giving the
              drawn gaps back: Delete account reaches toward 44 pt as far as its neighbours allow, Sign out has its own
              44-pt target 16 pt under it (F024). */}
          <View style={styles.deleteGap}>
            <ListRow
              testID="profile.delete"
              icon="trash"
              label="Delete account"
              danger
              look="profile"
              height={DELETE.height}
              gapAbove={DELETE.gap}
              gapBelow={SIGN_OUT.gap}
              onPress={() => deleteRef.current?.present()}
            />
          </View>
          <View style={styles.signOutGap}>
            <Button
              testID="profile.signOut"
              label={signingOut ? "Signing out…" : "Sign out"}
              variant="destructive"
              busy={signingOut}
              height={SIGN_OUT.height}
              hitSlop={SIGN_OUT_SLOP}
              text="profileSignout"
              style={styles.signOut}
              onPress={signOutNow}
            />
          </View>
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
          <HomeAirportSheet ref={homeAirportRef} profile={profile} homeCity={city} onSaved={copy.saved} />
          <CabinSheet ref={cabinRef} profile={profile} onSaved={copy.saved} />
          <TravelersSheet ref={travelersRef} profile={profile} onSaved={copy.saved} />
          <PhoneSheet ref={phoneRef} profile={profile} onSaved={copy.saved} />
          {/* A new password changes nothing on the profile (the sheet hands back the one it was given): nothing to
              merge, nothing to share. */}
          <PasswordSheet ref={passwordRef} profile={profile} onSaved={() => undefined} />
          <NotificationsSheet
            ref={notificationsRef}
            savedOffers={offersSwitchValue(profile)}
            onSaved={(offers) => copy.change((prev) => (prev ? withOffers(prev, offers) : prev))}
          />
        </>
      ) : null}
      <DeleteAccountSheet ref={deleteRef} openRequests={openRequests} onDeleted={() => router.replace("/join")} />
    </View>
  );
}

/** 12: a number over its name, centred on its column — `at` pt from the screen's middle. */
function Stat({ value, label, at }: { value: string; label: string; at: number }) {
  return (
    <View style={[styles.stat, { marginLeft: at - STAT_W / 2 }]} accessible accessibilityLabel={`${value} ${label}`}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/**
 * 12, measured (pt): the numbers' baseline 29.6 under `Flies from JFK`'s, their names' 14.7 under that; the columns
 * centred 121.3 left of the middle, on it and 120.3 right of it; two rules 22.6 tall from 16.9 under the home line,
 * 66.7 and 66.9 either side of the middle. The pills 33.9 tall, 14.7 under the names, from
 * 16.3 to 16.1 pt in, 8.1 apart. `My trips` 37.2 under the pills (its ink 17.1 in), `See all ›` ending 18.9 pt from the
 * edge, 2.3 above its baseline. The trips 10.8 under the title, from 12.5 in, 4.9 apart. The row cards 13.1 under the
 * trips, 15 in from the left and 16 from the right, 9.5 apart (8.8 before Delete account); Sign out 7.6 under, 29.3
 * tall, 15.6 in — drawn here 16 under (F024): DESIGN.md's 44-pt targets need room the image does not leave between
 * two red actions, and a slip on Delete account must not sign the member out (`useSignOut` asks nothing).
 */
const STAT_W = 110;
const PILL = 33.9;
/** The pills reach 44 pt above and below (`Button`'s slop): their holders keep that room. */
const PILL_SLOP = hitSlopFor(PILL);
const DELETE = { height: 33.4, gap: 8.8 } as const;
const SIGN_OUT = { height: 29.3, gap: tokens.space.md } as const;
const DELETE_SLOP = hitSlopFor(DELETE.height, DELETE.gap, SIGN_OUT.gap);
const SIGN_OUT_SLOP = hitSlopFor(SIGN_OUT.height, SIGN_OUT.gap);
const statValue = tokens.type.statValue;
const statLabel = tokens.type.statLabel;
const homeType = tokens.type.profileHome;
const tripsTitle = tokens.type.profileSection;
const seeAll = tokens.type.profileLink;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  scroll: { paddingBottom: tokens.space.xl },
  bandPlaceholder: { backgroundColor: tokens.colors.surfaceTint },
  bandAction: { position: "absolute", right: 19.2 },
  loadingIdentity: { alignItems: "center", gap: tokens.space.sm, marginTop: -AVATAR_OVER },
  content: { paddingHorizontal: tokens.space.gutter, paddingTop: tokens.space.lg, gap: tokens.space.md },
  // The block's top is the numbers' line box: their baseline 29.6 under the home line's.
  stats: {
    height: baselineOffset(statValue) + 14.7 + belowBaseline(statLabel),
    marginTop: 29.6 - belowBaseline(homeType) - baselineOffset(statValue),
  },
  stat: { position: "absolute", left: "50%", top: 0, width: STAT_W, alignItems: "center" },
  statRule: {
    position: "absolute",
    left: "50%",
    // 16.9 under the home line's baseline, which is 29.6 − the numbers' offset above the block.
    top: 16.9 - (29.6 - baselineOffset(statValue)),
    width: StyleSheet.hairlineWidth,
    height: 22.6,
    backgroundColor: tokens.colors.borderDefault,
  },
  statValue: { ...rn(statValue), color: tokens.colors.textPrimary },
  statLabel: {
    ...rn(statLabel),
    color: tokens.colors.textOnTint,
    marginTop: 14.7 - belowBaseline(statValue) - baselineOffset(statLabel),
  },
  actions: {
    flexDirection: "row",
    gap: 8.1,
    paddingLeft: 16.3,
    paddingRight: 16.1,
    marginTop: 14.7 - belowBaseline(statLabel) - PILL_SLOP.top,
    marginBottom: -PILL_SLOP.bottom,
  },
  actionsAlone: { marginTop: tokens.space.lg - PILL_SLOP.top },
  action: { flex: 1, paddingTop: PILL_SLOP.top, paddingBottom: PILL_SLOP.bottom },
  pill: { alignSelf: "stretch", ...tokens.elevation.card },
  tripsHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingLeft: 16,
    paddingRight: 18.9 - 3.2 - 2,
    marginTop: 37.2 - baselineOffset(tripsTitle),
  },
  tripsTitle: { ...rn(tripsTitle), color: tokens.colors.textPrimary },
  seeAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10.1 - 4.4,
    marginTop: baselineOffset(tripsTitle) - 2.3 - baselineOffset(seeAll),
  },
  seeAllText: { ...rn(seeAll), color: tokens.colors.textOnTint },
  pressed: { opacity: 0.7 },
  tripsRow: { paddingLeft: 12.5, paddingRight: 8.3, gap: 4.9, marginTop: 10.8 - belowBaseline(tripsTitle) },
  rows: { paddingLeft: 15, paddingRight: 16, marginTop: 13.1 },
  cardGap: { marginTop: 9.5 },
  deleteGap: {
    marginTop: DELETE.gap - DELETE_SLOP.top,
    paddingTop: DELETE_SLOP.top,
    paddingBottom: DELETE_SLOP.bottom,
  },
  // What follows (a failed sign-out's line, the photograph's credit) starts under Sign out's target, not over it.
  signOutGap: {
    marginTop: SIGN_OUT.gap - DELETE_SLOP.bottom - SIGN_OUT_SLOP.top,
    paddingTop: SIGN_OUT_SLOP.top,
    paddingBottom: SIGN_OUT_SLOP.bottom,
    marginLeft: 0.6,
    marginRight: -0.4,
  },
  signOut: { alignSelf: "stretch", borderWidth: 0.6 },
  // A message is `text-secondary`, never `status-danger` (DESIGN.md: that is for a field at fault only).
  message: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary, textAlign: "center", marginTop: 8 },
});
