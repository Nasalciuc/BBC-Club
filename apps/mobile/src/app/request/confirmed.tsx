import * as Notifications from "expo-notifications";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ProposalCardVM } from "@bbc/shared/api/v1/proposals";
import {
  BackButton,
  Button,
  CheckCircle,
  Divider,
  Photo,
  PhotoCredit,
  SectionHeader,
  TripCard,
  Wordmark,
  rn,
  tokens,
} from "@bbc/ui";

import { RootTabBar } from "@/components/RootTabBar";
import { ScreenStatusBar } from "@/components/screen-status-bar";
import { destinationHref } from "@/features/explore/destination-route";
import { cheapestFareOnRoute, fareHref } from "@/features/explore/open-offer";
import { OfferCards } from "@/features/explore/SheetRest";
import { useExploreHome } from "@/features/explore/useExploreHome";
import {
  NotificationsAskSheet,
  type NotificationsAskSheetHandle,
} from "@/features/notifications/NotificationsAskSheet";
import { bandPicture, cardPicture } from "@/features/places/place-photo-logic";
import { CLUB_PICTURE, PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";
import { confirmationKind, otherFares, tripFacts, type RequestSource } from "@/features/requests/confirmation-logic";
import { fetchProfile } from "@/lib/api";
import { env } from "@/lib/env";
import { displayPhone } from "@/lib/phone";
import { shouldAskForPush, type PermissionStatus } from "@/lib/push-ask-logic";
import { appStorage, PUSH_ASKED_AT_KEY } from "@/lib/storage-keys";

/** 08: the city's photograph, the sheet over its foot with the check on its edge. */
const HERO = 300;
const OVERLAP = 24;
const CHECK = 72;

/**
 * The request's confirmation (08, 25, 26): the city's photograph under the white wordmark; the check on the sheet's
 * edge, `Request received.` and the number the specialist will call; `London is next.` with the trip; `View request ›`;
 * `Other great fares`. Saved on an offline phone, a page of its own (26). The tab bar shows Requests: the request is
 * there now. The notifications question rises over it once (25).
 */
export default function RequestConfirmedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const askRef = useRef<NotificationsAskSheetHandle>(null);
  const params = useLocalSearchParams<{
    id?: string;
    source?: string;
    queued?: string;
    city?: string;
    phone?: string;
    from?: string;
    to?: string;
    cabin?: string;
    trip?: string;
    dates?: string;
    travelers?: string;
    carrier?: string;
    logo?: string;
    media?: string;
  }>();
  const text = (v: string | undefined) => (typeof v === "string" ? v : "");
  const source: RequestSource = params.source === "search" ? "search" : "offer";
  const kind = confirmationKind(source, params.queued === "1");
  // The number this request will be called on, as the sheet sent it; the profile's only when the sheet passed none.
  const requestPhone = text(params.phone) || null;
  const [profilePhone, setProfilePhone] = useState<string | null>(null);
  const phone = requestPhone ?? profilePhone;
  const from = text(params.from);
  const to = text(params.to);
  const city = text(params.city);
  const { home } = useExploreHome();
  const others = otherFares(home, to);
  const photoFor = usePlacePhotos(kind === "saved" ? [] : [to]);

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

  const id = text(params.id);
  const viewRequest = () => {
    if (id) router.push(`/request/${id}` as Href);
  };

  async function openOther(card: ProposalCardVM) {
    const fare = await cheapestFareOnRoute(card);
    if (fare) {
      router.push(fareHref(fare.id, card.id));
      return;
    }
    const place = home?.destinations.find((d) => d.code === card.route.to);
    if (place) router.push(destinationHref(place, null));
  }

  if (kind === "saved") {
    return (
      <View style={styles.root} testID="confirmation.root">
        <ScreenStatusBar on="light" />
        <View style={[styles.savedTop, { paddingTop: insets.top + tokens.space.xs }]}>
          <BackButton testID="confirmation.back" variant="tint" onPress={() => router.back()} />
        </View>
        <View style={styles.saved}>
          <Text style={styles.headline} accessibilityRole="header">
            Saved. It goes out when you’re back online.
          </Text>
          <Text style={styles.bodyLg}>
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

  const picture = bandPicture(text(params.media) || null, photoFor(to), {
    headers: PICTURE_HEADERS,
    mapboxToken: env.EXPO_PUBLIC_MAPBOX_TOKEN,
    size: { width, height: HERO },
  });
  const credit = picture.credit;
  const creditLink = credit?.link ?? null;
  const carrier = text(params.carrier);
  const facts = tripFacts(text(params.trip), text(params.travelers));

  return (
    <View style={styles.root} testID="confirmation.root">
      <ScreenStatusBar on="dark" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <Photo source={picture.source} fallback={CLUB_PICTURE} cachePolicy={picture.cache} style={styles.fill} />
          <View style={[styles.wordmark, { top: insets.top + tokens.space.sm }]}>
            <Wordmark tone="white" />
          </View>
        </View>
        <View style={styles.sheet}>
          <View style={styles.check}>
            <CheckCircle testID="confirmation.check" />
          </View>
          <View style={styles.received}>
            <Text style={[styles.headline, styles.centred]} accessibilityRole="header">
              Request received.
            </Text>
            <Text style={[styles.bodyLg, styles.centred]}>
              {phone ? (
                <>
                  {"A specialist will call you shortly on\n"}
                  <Text style={styles.phone}>{phone}</Text>.
                </>
              ) : (
                "A specialist will call you shortly."
              )}
            </Text>
          </View>
          <Divider />
          {city ? (
            <Text style={styles.title} accessibilityRole="header">
              {`${city} is next.`}
            </Text>
          ) : null}
          {from && to ? (
            <TripCard
              testID="confirmation.trip"
              photo={cardPicture(text(params.media) || null, photoFor(to), PICTURE_HEADERS)}
              fallback={CLUB_PICTURE}
              cabin={params.cabin === "first" ? "FIRST CLASS" : "BUSINESS CLASS"}
              from={from}
              to={to}
              dates={text(params.dates) || null}
              facts={facts}
              carrier={carrier ? { name: carrier, logoUrl: text(params.logo) || null } : null}
            />
          ) : null}
          <Button
            testID="confirmation.viewRequest"
            label="View request"
            variant="primary"
            trailing="chevron"
            trailingAtEdge
            onPress={viewRequest}
          />
          {credit ? (
            // The credit the photograph owes (ADR-IMPL-043).
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
          {others.length > 0 ? (
            <View style={styles.others}>
              <SectionHeader title="Other great fares" size="subtitle" />
              <OfferCards
                items={others}
                home={home}
                onOpenOffer={(card) => void openOther(card)}
                testID="confirmation.others"
                cardTestID="confirmation.other"
                compact
              />
            </View>
          ) : null}
        </View>
      </ScrollView>
      <RootTabBar active="requests" />
      <NotificationsAskSheet ref={askRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  scroll: { paddingBottom: tokens.space.lg },
  fill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  hero: { height: HERO, backgroundColor: tokens.colors.surfaceTint },
  wordmark: { position: "absolute", left: tokens.space.gutter },
  // 08: the sheet over the photograph's foot, the check on its edge.
  sheet: {
    marginTop: -OVERLAP,
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    backgroundColor: tokens.colors.surfacePage,
    paddingHorizontal: tokens.space.gutter,
    paddingBottom: tokens.space.md,
    gap: tokens.space.md,
  },
  check: { alignItems: "center", marginTop: -CHECK / 2 },
  received: { gap: tokens.space.xs },
  centred: { textAlign: "center" },
  phone: {
    ...rn(tokens.type.bodyLg),
    fontFamily: rn(tokens.type.bodyStrong).fontFamily,
    color: tokens.colors.textPrimary,
  },
  others: { gap: tokens.space.xxs },
  savedTop: { paddingHorizontal: tokens.space.gutter },
  // 26: the message a third down the page, its title and words 12 apart.
  saved: { flex: 1, justifyContent: "center", paddingHorizontal: tokens.space.gutter, gap: tokens.space.sm },
  // The pill 24 pt over the tab bar.
  actions: { paddingHorizontal: tokens.space.gutter, paddingBottom: tokens.space.lg },
  headline: { ...rn(tokens.type.headline), color: tokens.colors.textPrimary },
  title: { ...rn(tokens.type.title), color: tokens.colors.textPrimary },
  bodyLg: { ...rn(tokens.type.bodyLg), color: tokens.colors.textSecondary },
});
