import * as Notifications from "expo-notifications";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AirportVM } from "@bbc/shared/api/v1/fares";
import { BackButton, Button, GlobeFallback, Photo, PhotoCredit, tokens, rn } from "@bbc/ui";

import { RootTabBar } from "@/components/RootTabBar";
import {
  NotificationsAskSheet,
  type NotificationsAskSheetHandle,
} from "@/features/notifications/NotificationsAskSheet";
import { bandPicture } from "@/features/places/place-photo-logic";
import { CLUB_PICTURE, PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";
import { confirmationKind, factsLines, type RequestSource } from "@/features/requests/confirmation-logic";
import { airportByCode } from "@/lib/airport-by-code";
import { fetchProfile } from "@/lib/api";
import { env } from "@/lib/env";
import { displayPhone } from "@/lib/phone";
import { shouldAskForPush, type PermissionStatus } from "@/lib/push-ask-logic";
import { appStorage, PUSH_ASKED_AT_KEY } from "@/lib/storage-keys";

/** Figma 476:8871: the search's globe band, 408 pt; the drawn globe 520 pt, 32 pt above the band's top. */
const GLOBE_BAND = 408;
const GLOBE_SIZE = 520;

const noop = () => undefined;

/**
 * The request's confirmation, one of three (Figma): an offer's over its city's photograph (135:856), a search's under
 * the globe with its route (476:8871), or the one a request saved on an offline phone gets (135:855). The tab bar shows
 * Requests: the request is there now.
 */
export default function RequestConfirmedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const askRef = useRef<NotificationsAskSheetHandle>(null);
  const params = useLocalSearchParams<{
    id?: string;
    source?: string;
    queued?: string;
    city?: string;
    route?: string;
    facts?: string;
    phone?: string;
    from?: string;
    to?: string;
    title?: string;
    media?: string;
  }>();
  const text = (v: string | undefined) => (typeof v === "string" ? v : "");
  const source: RequestSource = params.source === "search" ? "search" : "offer";
  const kind = confirmationKind(source, params.queued === "1");
  // The number this request will be called on, as the sheet sent it (Figma 135:856: `+1 (212) 555-0148`, as the
  // request's detail writes it); the profile's only when an older sheet passed none.
  const requestPhone = text(params.phone) || null;
  const [profilePhone, setProfilePhone] = useState<string | null>(null);
  const phone = requestPhone ?? profilePhone;
  const from = text(params.from);
  const to = text(params.to);
  // The search's globe draws the route once both airports are placed.
  const [route, setRoute] = useState<{ from: AirportVM; to: AirportVM } | null>(null);
  const photoFor = usePlacePhotos(kind === "offer" ? [to] : []);

  useEffect(() => {
    // Saved on the phone (offline): this screen names no number, and there is no network to ask.
    if (requestPhone || kind === "saved") return;
    let cancelled = false;
    void (async () => {
      const profile = await fetchProfile();
      if (!cancelled && profile.ok) setProfilePhone(displayPhone(profile.data.phone));
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [requestPhone, kind]);

  useEffect(() => {
    if (kind !== "search" || !from || !to) return;
    let cancelled = false;
    void (async () => {
      const [a, b] = await Promise.all([airportByCode(from), airportByCode(to)]);
      if (!cancelled && a && b) setRoute({ from: a, to: b });
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [kind, from, to]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const current = await Notifications.getPermissionsAsync();
        if (cancelled) return;
        const raw = appStorage.getString(PUSH_ASKED_AT_KEY);
        const parsed = raw == null || raw === "" ? null : Number(raw);
        const askedAt = parsed != null && Number.isFinite(parsed) ? parsed : null;
        const status: PermissionStatus =
          current.status === "granted" || current.status === "denied" ? current.status : "undetermined";
        if (shouldAskForPush(status, askedAt)) askRef.current?.present();
      } catch {
        // Permission state is best-effort; the request itself already succeeded.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const city = text(params.city);
  // Figma 135:856: the facts under the city on two lines; the route alone from an older sheet.
  const facts = factsLines(text(params.facts) || text(params.route));
  const id = text(params.id);
  const viewRequest = () => {
    if (id) router.push(`/request/${id}` as Href);
  };
  // Figma writes the promise on two lines, the number on the second.
  const promise = phone ? `A specialist will call you shortly\non ${phone}.` : "A specialist will call you shortly.";

  if (kind === "saved") {
    return (
      <View style={styles.root} testID="confirmation.root">
        <View style={[styles.savedTop, { paddingTop: insets.top }]}>
          <BackButton testID="confirmation.back" onPress={() => router.back()} />
        </View>
        <View style={styles.saved}>
          <Text style={styles.display} accessibilityRole="header">
            Saved. It goes out when you’re back online.
          </Text>
          <Text style={styles.body}>
            You’re offline right now. Nothing more to do — a specialist will call you shortly after it arrives.
          </Text>
        </View>
        <View style={styles.actions}>
          <Button testID="confirmation.done" label="Done" variant="primary" onPress={() => router.back()} />
        </View>
        <RootTabBar active="requests" />
        <NotificationsAskSheet ref={askRef} />
      </View>
    );
  }

  if (kind === "offer") {
    const picture = bandPicture(text(params.media) || null, photoFor(to), {
      headers: PICTURE_HEADERS,
      mapboxToken: env.EXPO_PUBLIC_MAPBOX_TOKEN,
      size: { width, height },
    });
    const credit = picture.credit;
    const creditLink = credit?.link ?? null;
    return (
      <View style={styles.root} testID="confirmation.root">
        <View style={styles.photo}>
          <Photo source={picture.source} fallback={CLUB_PICTURE} cachePolicy={picture.cache} style={styles.fill} />
          {/* 436:1220: the photograph under a flat night veil, so the words on it keep their contrast. */}
          <View style={[styles.fill, styles.veil]} />
          <View style={[styles.offerTop, { paddingTop: insets.top + 56 }]}>
            <Text style={[styles.display, styles.onDark]} accessibilityRole="header">
              Request received.
            </Text>
            <Text style={[styles.body, styles.onDark]}>{promise}</Text>
          </View>
          <View style={[styles.offerBottom, !credit && styles.offerBottomBare]}>
            {city ? <Text style={[styles.headline, styles.onDark]}>{`${city} is next.`}</Text> : null}
            {facts.length > 0 ? (
              <Text testID="confirmation.facts" style={[styles.mono, styles.onDark]}>
                {facts.join("\n")}
              </Text>
            ) : null}
            {credit ? (
              // The credit the photo owes (ADR-IMPL-043).
              <PhotoCredit
                testID="confirmation.photoCredit"
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
          <View style={styles.actions}>
            <Button testID="confirmation.viewRequest" label="View request" onPress={viewRequest} />
          </View>
        </View>
        <RootTabBar active="requests" />
        <NotificationsAskSheet ref={askRef} />
      </View>
    );
  }

  const title = text(params.title);
  return (
    <View style={styles.root} testID="confirmation.root">
      <View style={styles.globeBand} testID="confirmation.globe">
        <View style={styles.globe} pointerEvents="none">
          <GlobeFallback
            pins={
              route
                ? [{ code: route.to.code, lat: route.to.lat, lng: route.to.lng, hasOffer: false, fromPrice: "" }]
                : []
            }
            home={route ? { lat: route.from.lat, lng: route.from.lng } : null}
            selected={route ? route.to.code : null}
            onSelect={noop}
            size={GLOBE_SIZE}
          />
        </View>
      </View>
      <View style={styles.search}>
        <Text style={styles.display} accessibilityRole="header">
          Request received.
        </Text>
        <Text style={[styles.body, styles.primary]}>{promise}</Text>
        <View style={styles.destination}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {facts.length > 0 ? (
            <Text testID="confirmation.facts" style={styles.mono}>
              {facts.join("\n")}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.actions}>
        <Button testID="confirmation.viewRequest" label="View request" variant="primary" onPress={viewRequest} />
      </View>
      <RootTabBar active="requests" />
      <NotificationsAskSheet ref={askRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  fill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  // 135:856: the photograph fills the screen down to the tab bar.
  photo: { flex: 1, backgroundColor: tokens.colors.surfaceNight },
  veil: { backgroundColor: tokens.colors.surfaceNight, opacity: 0.32 },
  // 476:8841: the success moment 104 pt down (56 under the status bar), its lines 16 apart.
  offerTop: { paddingHorizontal: tokens.space.lg, gap: tokens.space.md },
  // 476:8844: the destination 62 pt over the button (540 on the frame), its lines 12 apart; a photo's credit, when it
  // owes one, takes its 44-pt row from that space.
  offerBottom: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: tokens.space.lg,
    paddingBottom: 62 - 44,
    gap: tokens.space.sm,
  },
  offerBottomBare: { paddingBottom: 62 },
  // 476:8902: the night band behind the globe, the globe 32 pt above its top, centred.
  globeBand: { height: GLOBE_BAND, overflow: "hidden", backgroundColor: tokens.colors.surfaceNight },
  globe: { position: "absolute", top: -32, left: "50%", marginLeft: -GLOBE_SIZE / 2 },
  // 476:8944: 24 under the band, the success moment's lines 16 apart.
  search: { flex: 1, paddingHorizontal: tokens.space.lg, paddingTop: tokens.space.lg, gap: tokens.space.md },
  destination: { gap: tokens.space.xs },
  savedTop: { paddingHorizontal: tokens.space.lg },
  // 476:9044: 92 pt under the back button (184 on the frame), title and words 24 apart.
  saved: { flex: 1, paddingHorizontal: tokens.space.lg, paddingTop: 92, gap: tokens.space.lg },
  // The button 32 pt over the tab bar (680 on the frame).
  actions: { paddingHorizontal: tokens.space.lg, paddingBottom: tokens.space.xl },
  display: { ...rn(tokens.type.display), color: tokens.colors.textPrimary },
  headline: { ...rn(tokens.type.headline), color: tokens.colors.textPrimary },
  title: { ...rn(tokens.type.title), color: tokens.colors.textPrimary },
  body: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
  primary: { color: tokens.colors.textPrimary },
  mono: { ...rn(tokens.type.factsMono), color: tokens.colors.textSecondary },
  onDark: { color: tokens.colors.textOnDark },
});
