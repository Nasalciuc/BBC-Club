import * as Notifications from "expo-notifications";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ProposalCardVM } from "@bbc/shared/api/v1/proposals";
import {
  BackButton,
  Button,
  CHECK_CIRCLE_SIZE,
  CheckCircle,
  Icon,
  Photo,
  PhotoCredit,
  TripCard,
  Wordmark,
  baselineOffset,
  belowBaseline,
  rn,
  tokens,
} from "@bbc/ui";

import { RootTabBar } from "@/components/RootTabBar";
import { ScreenStatusBar } from "@/components/screen-status-bar";
import { destinationHref } from "@/features/explore/destination-route";
import { cheapestFareOnRoute, fareHref } from "@/features/explore/open-offer";
import { OfferCards } from "@/features/explore/SheetRest";
import { useExploreHome } from "@/features/explore/useExploreHome";
import { airlineMark, airlineRibbon } from "@/features/fares/airline-marks";
import {
  NotificationsAskSheet,
  type NotificationsAskSheetHandle,
} from "@/features/notifications/NotificationsAskSheet";
import { RECEIVED_TRIP_FRAME, clubPhoto, clubReceivedPhoto } from "@/features/places/club-photos";
import { bandPicture, cardPicture } from "@/features/places/place-photo-logic";
import { CLUB_PICTURE, PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";
import { confirmationKind, otherFares, tripFacts, type RequestSource } from "@/features/requests/confirmation-logic";
import { fetchProfile } from "@/lib/api";
import { env } from "@/lib/env";
import { displayPhone } from "@/lib/phone";
import { shouldAskForPush, type PermissionStatus } from "@/lib/push-ask-logic";
import { appStorage, PUSH_ASKED_AT_KEY } from "@/lib/storage-keys";

type Role = { fontSize: number; lineHeight: number };

/** The margin that puts a line's baseline `pitch` under the one before it. */
const after = (pitch: number, prev: Role, next: Role) => pitch - belowBaseline(prev) - baselineOffset(next);

const title = tokens.type.receivedTitle;
const body = tokens.type.receivedBody;
const phoneRole = tokens.type.receivedPhone;
const next = tokens.type.receivedNext;
const section = tokens.type.receivedSection;
const seeAll = tokens.type.receivedSeeAll;
/** The wordmark's line: ` Club`, the larger of its two sizes, sets where the baseline falls in it. */
const wordmarkLine = {
  fontSize: tokens.type.wordmarkReceivedClub.fontSize,
  lineHeight: tokens.type.wordmarkReceived.lineHeight,
};

/**
 * 08, measured (pt, from the safe area's top — 47 on the image — and from the sheet's top edge): Tower Bridge to 290.2
 * under the safe area, the wordmark's baseline 13.75 under it, 25 in; the white sheet from 258, its corners 16; the
 * check's middle 4.13 under its edge; `Request received.` on 69.58, the call on 95.54 and the number on 115.04 (19.5
 * apart), all centred; the rule's middle 17.51 under the last line, 24 in, 0.7 thick; `London is next.` on 164.49,
 * 24.84 in; the trip card from 176.25 on 21.2 gutters; `View request ›` 9.27 under it, 34.36 tall, 21.1 and 21.5 in,
 * its chevron (16.15 at 2.08) 8.57 from its right edge and 0.47 low; `Other great fares` on 348.14, 24 in, `See all`
 * on 347.04, 330.4 in, its chevron (13.27 at 2.29) 1.6 after it and 0.49 under the words' middle; the cards from
 * 357.97, the first 20.8 from the screen's edge, 8.55 apart.
 */
const PAGE = {
  hero: 290.2,
  wordmark: { left: 25.01, baseline: 13.75 },
  sheet: { top: 258, radius: 16 },
  check: 4.13,
  title: 69.58,
  body: 25.96,
  phone: 19.5,
  rule: { below: 17.51, inset: 24, thickness: 0.7 },
  next: { baseline: 31.94, left: 24.84 },
  trip: { below: 11.76, left: 21.2, right: 21.2 },
  pill: { above: 9.27, height: 34.36, left: 21.11, right: 21.5, chevron: { size: 16.15, stroke: 2.082, inset: 8.57 } },
  pillChevron: { x: 0, y: 0.47 },
  others: { baseline: 31.46, left: 24.01 },
  seeAll: { left: 330.37, rise: 1.1, gap: 1.6, chevron: { size: 13.27, stroke: 2.293, drop: 0.49 } },
  cards: { below: 9.83, inset: 20.8, gap: 8.55 },
} as const;

/** 26, measured from the safe area's top: the back button's middle 6.3 under it, 37.6 in, 35.3 across; the message 23.6
 *  in, in a 328-pt column (where 26 breaks its lines) — its title on 254.85 and 285.34, the words on 322.75 and 343.8;
 *  `Done` 42.93 tall, 19.96 and 20.5 in, its foot 27.35 over the tab bar. */
const SAVED = {
  back: {
    centre: { x: 37.6, y: 6.3 },
    diameter: 35.3,
    glyph: { size: 23.21, stroke: 2.179, offset: { x: -1.17, y: 0.22 } },
  },
  left: 23.6,
  column: 328,
  title: { baseline: 254.85, pitch: 30.49 },
  body: { baseline: 322.75, pitch: 21.05, left: 23.85 },
  pill: { height: 42.93, left: 19.96, right: 20.5, bottom: 27.35 },
} as const;
// 26's lines as it spaces them (the tokens round a line height to the point).
const savedTitle = {
  ...rn(tokens.type.savedTitle),
  fontSize: tokens.type.savedTitle.fontSize,
  lineHeight: SAVED.title.pitch,
};
const savedBody = {
  ...rn(tokens.type.savedBody),
  fontSize: tokens.type.savedBody.fontSize,
  lineHeight: SAVED.body.pitch,
};

/**
 * The request's confirmation (08, 25, 26): Tower Bridge under the navy wordmark; the check on the sheet's edge,
 * `Request received.` and the number the specialist will call; `London is next.` with the trip; `View request ›`;
 * `Other great fares` and `See all ›`, which opens every offer on Explore (16). Saved on an offline phone, a page of
 * its own (26). The tab bar shows Requests: the request is there now. The notifications question rises over it once (25).
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
    airline?: string;
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
    const s = SAVED;
    return (
      <View style={styles.root} testID="confirmation.root">
        <ScreenStatusBar on="light" />
        <BackButton
          testID="confirmation.back"
          variant="round"
          diameter={s.back.diameter}
          glyph={s.back.glyph}
          onPress={() => router.back()}
          style={StyleSheet.flatten([
            styles.absolute,
            {
              left: s.back.centre.x - s.back.diameter / 2,
              top: insets.top + s.back.centre.y - s.back.diameter / 2,
            },
          ])}
        />
        <View style={styles.saved}>
          <Text
            style={[savedTitle, styles.navy, { marginTop: insets.top + s.title.baseline - baselineOffset(savedTitle) }]}
            accessibilityRole="header"
          >
            Saved. It goes out when you’re back online.
          </Text>
          <Text
            style={[
              savedBody,
              styles.slate,
              {
                marginLeft: s.body.left - s.left,
                // From the title's last line: the words' first baseline 322.75 under the safe area's top.
                marginTop:
                  s.body.baseline -
                  s.title.baseline -
                  s.title.pitch -
                  belowBaseline(savedTitle) -
                  baselineOffset(savedBody),
              },
            ]}
          >
            You’re offline right now. Nothing more to do — a specialist will call you shortly after it arrives.
          </Text>
        </View>
        <View style={[styles.savedPill, { paddingBottom: s.pill.bottom }]}>
          <Button
            testID="confirmation.done"
            label="Done"
            variant="primary"
            height={s.pill.height}
            text="buttonSaved"
            style={{ marginLeft: s.pill.left, marginRight: s.pill.right }}
            onPress={() => router.back()}
          />
        </View>
        <RootTabBar active="requests" />
        <NotificationsAskSheet ref={askRef} />
      </View>
    );
  }

  const g = PAGE;
  const heroHeight = insets.top + g.hero;
  const own = clubReceivedPhoto(to);
  const picture = bandPicture(text(params.media) || null, photoFor(to), {
    headers: PICTURE_HEADERS,
    mapboxToken: env.EXPO_PUBLIC_MAPBOX_TOKEN,
    size: { width, height: heroHeight },
  });
  // The design's own photograph of the city where it has one (08: Tower Bridge); the request's or the place's else.
  const heroSource = own?.source ?? picture.source;
  const credit = own ? null : picture.credit;
  const creditLink = credit?.link ?? null;
  const carrierName = text(params.carrier);
  const carrier = carrierName ? { name: carrierName, logoUrl: text(params.logo) || null } : null;
  const airline = text(params.airline) || null;
  const facts = tripFacts(text(params.trip), text(params.travelers));
  const lastLine = phone ? phoneRole : body;

  return (
    <View style={styles.root} testID="confirmation.root">
      <ScreenStatusBar on="light" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.hero, { height: heroHeight }]}>
          <Photo
            source={heroSource}
            fallback={CLUB_PICTURE}
            cachePolicy={own ? "disk" : picture.cache}
            position={own ? { left: own.left, top: 0 } : undefined}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              styles.absolute,
              {
                left: g.wordmark.left,
                top: insets.top + g.wordmark.baseline - baselineOffset(wordmarkLine),
              },
            ]}
          >
            <Wordmark look="received" testID="confirmation.wordmark" />
          </View>
        </View>
        <View
          style={[
            styles.sheet,
            {
              marginTop: insets.top + g.sheet.top - heroHeight,
              borderTopLeftRadius: g.sheet.radius,
              borderTopRightRadius: g.sheet.radius,
            },
          ]}
        >
          <View style={[styles.check, { top: g.check - CHECK_CIRCLE_SIZE / 2 }]}>
            <CheckCircle testID="confirmation.check" />
          </View>
          <Text
            style={[rn(title), styles.navy, styles.centred, { marginTop: g.title - baselineOffset(title) }]}
            accessibilityRole="header"
          >
            Request received.
          </Text>
          <Text style={[rn(body), styles.slate, styles.centred, { marginTop: after(g.body, title, body) }]}>
            {phone ? "A specialist will call you shortly on" : "A specialist will call you shortly."}
          </Text>
          {phone ? (
            <Text style={[rn(phoneRole), styles.navy, styles.centred, { marginTop: after(g.phone, body, phoneRole) }]}>
              {phone}
              <Text style={[rn(body), styles.slate]}>.</Text>
            </Text>
          ) : null}
          <View
            style={[
              styles.rule,
              {
                height: g.rule.thickness,
                marginHorizontal: g.rule.inset,
                marginTop: g.rule.below - belowBaseline(lastLine) - g.rule.thickness / 2,
              },
            ]}
          />
          {city ? (
            <Text
              style={[
                rn(next),
                styles.navy,
                { marginLeft: g.next.left, marginTop: g.next.baseline - g.rule.thickness / 2 - baselineOffset(next) },
              ]}
              accessibilityRole="header"
            >
              {`${city} is next.`}
            </Text>
          ) : null}
          {from && to ? (
            <View
              style={{
                marginLeft: g.trip.left,
                marginRight: g.trip.right,
                marginTop: city ? g.trip.below - belowBaseline(next) : tokens.space.md,
              }}
            >
              <TripCard
                testID="confirmation.trip"
                photo={
                  clubPhoto(to, "request") ?? cardPicture(text(params.media) || null, photoFor(to), PICTURE_HEADERS)
                }
                position={clubPhoto(to, "request") ? RECEIVED_TRIP_FRAME : undefined}
                fallback={CLUB_PICTURE}
                cabin={params.cabin === "first" ? "FIRST CLASS" : "BUSINESS CLASS"}
                from={from}
                to={to}
                dates={text(params.dates) || null}
                facts={facts}
                carrier={carrier}
                ribbon={carrier ? airlineRibbon(airline) : null}
                mark={carrier && !airlineRibbon(airline) ? airlineMark(airline) : null}
              />
            </View>
          ) : null}
          <Button
            testID="confirmation.viewRequest"
            label="View request"
            variant="primary"
            height={g.pill.height}
            text="buttonReceived"
            trailing="chevron"
            trailingAtEdge
            trailingInset={g.pill.chevron.inset}
            trailingSize={g.pill.chevron.size}
            trailingStroke={g.pill.chevron.stroke}
            trailingOffset={g.pillChevron}
            style={{ marginLeft: g.pill.left, marginRight: g.pill.right, marginTop: g.pill.above }}
            onPress={viewRequest}
          />
          {credit ? (
            // The credit the photograph owes (ADR-IMPL-043).
            <View style={styles.credit}>
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
            </View>
          ) : null}
          {others.length > 0 ? (
            <View>
              <View style={{ marginTop: g.others.baseline - baselineOffset(section) }}>
                <Text style={[rn(section), styles.navy, { marginLeft: g.others.left }]} accessibilityRole="header">
                  Other great fares
                </Text>
                <Pressable
                  testID="confirmation.seeAll"
                  accessibilityRole="button"
                  accessibilityLabel="See all fares"
                  hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}
                  onPress={() => router.dismissTo({ pathname: "/(tabs)/explore", params: { offers: "all" } })}
                  style={({ pressed }) => [
                    styles.seeAll,
                    {
                      left: g.seeAll.left,
                      top: baselineOffset(section) - g.seeAll.rise - baselineOffset(seeAll),
                      gap: g.seeAll.gap,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[rn(seeAll), styles.subtle]}>See all</Text>
                  <View style={{ transform: [{ translateY: g.seeAll.chevron.drop }] }}>
                    <Icon
                      name="chevron"
                      size={g.seeAll.chevron.size}
                      color={tokens.colors.textSubtle}
                      strokeWidth={g.seeAll.chevron.stroke}
                    />
                  </View>
                </Pressable>
              </View>
              <View style={{ marginTop: g.cards.below - belowBaseline(section) - CAROUSEL_PAD }}>
                <OfferCards
                  items={others}
                  home={home}
                  onOpenOffer={(card) => void openOther(card)}
                  testID="confirmation.others"
                  cardTestID="confirmation.other"
                  compact
                  row={{ bleed: 0, inset: g.cards.inset, gap: g.cards.gap }}
                />
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>
      <RootTabBar active="requests" />
      <NotificationsAskSheet ref={askRef} />
    </View>
  );
}

/** The room the offers' row keeps over its cards for their shadow (`CarouselRow`). */
const CAROUSEL_PAD = tokens.space.sm;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  scroll: { paddingBottom: tokens.space.md },
  absolute: { position: "absolute" },
  hero: { backgroundColor: tokens.colors.surfaceTint, overflow: "hidden" },
  sheet: { backgroundColor: tokens.colors.surfaceCard, paddingBottom: tokens.space.xs },
  check: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 1 },
  centred: { textAlign: "center" },
  navy: { color: tokens.colors.textPrimary },
  slate: { color: tokens.colors.textSecondary },
  subtle: { color: tokens.colors.textSubtle },
  rule: { backgroundColor: tokens.colors.borderDefault },
  credit: { marginTop: tokens.space.xs, paddingHorizontal: tokens.space.gutter },
  seeAll: { position: "absolute", flexDirection: "row", alignItems: "center" },
  pressed: { opacity: 0.6 },
  saved: { paddingLeft: SAVED.left, width: SAVED.left + SAVED.column },
  savedPill: { flex: 1, justifyContent: "flex-end" },
});
