import NetInfo from "@react-native-community/netinfo";
import type { RequestVM } from "@bbc/shared/api/v1/requests";
import { useLocalSearchParams, useNavigation, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BackButton,
  Button,
  ErrorState,
  Icon,
  InfoCard,
  Photo,
  PhotoCredit,
  Skeleton,
  StatusBadge,
  Timeline,
  YourFareCard,
  tokens,
  rn,
} from "@bbc/ui";

import { RootTabBar } from "@/components/RootTabBar";
import { ScreenStatusBar } from "@/components/screen-status-bar";
import { isOffline } from "@/features/explore/offline-logic";
import { bandPicture } from "@/features/places/place-photo-logic";
import { CLUB_PICTURE, PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";
import { telHref } from "@/features/requests/confirmation-logic";
import { detailLines, detailTitle, queuedView, routeCodes } from "@/features/requests/request-card";
import { closedAt, progressSteps, requestView, serverState, stepCaption } from "@/features/requests/request-view-logic";
import { airportByCode } from "@/lib/airport-by-code";
import { fetchRequest, submitRequest } from "@/lib/api";
import { env } from "@/lib/env";
import { readFailureCopy, stateCopy } from "@/lib/error-context";
import { displayPhone } from "@/lib/phone";
import { getQueued, sendOne } from "@/lib/queue";
import { savingPercent } from "@/lib/saving";

/** 11: the line under the number we call. */
const BOOKING_NOTE = "Your specialist confirms availability and books by phone. No payment is taken in the app.";

/** Under `Send now` when it did not go: still offline, or the server did not take it this time. */
const SEND_OFFLINE = "You’re still offline. It goes out as soon as you’re back.";
const SEND_LATER = "It didn’t go through. We’ll try again in a few minutes.";

const REQUESTS = "/(tabs)/requests" as Href;

/** 11: the city's photograph, the sheet over its foot with 24-pt corners. */
const HERO = 248;
const OVERLAP = 24;
/** How long a first answer waits for the origin's city before the page shows its code instead (`JFK to London`). */
const ORIGIN_WAIT_MS = 1200;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isQueuedId(id: string): boolean {
  return id.startsWith("q_");
}

type Loaded =
  | { kind: "server"; vm: RequestVM }
  // A request still on the phone: waiting to go, or refused by the server for good.
  | { kind: "queued"; vm: RequestVM; rejected: boolean };

/** 11, 30: `We will call` and the member's number, in a white card. */
function CallbackCard({ phone }: { phone: string }) {
  return (
    <View style={styles.callbackCard} accessible accessibilityLabel={`We will call ${phone}`}>
      <View style={styles.callbackIcon}>
        <Icon name="phone" size={22} color={tokens.colors.textPrimary} strokeWidth={2} />
      </View>
      <View style={styles.grow}>
        <Text style={styles.callbackLabel}>We will call</Text>
        <Text testID="request.callback.phone" style={styles.callbackPhone}>
          {phone}
        </Text>
      </View>
    </View>
  );
}

/**
 * A request (11 quote ready, 30 received, 31 booked, 32 not sent, 33 closed): the destination's photograph under a
 * sheet; the route by its cities, the trip's facts; `Request progress` in three steps; what is happening and what comes
 * next; a quote's fare; the number we call; and the one thing to do, when there is one — call, or send now.
 */
export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // The origin's city, for the airport it was looked up for.
  const [origin, setOrigin] = useState<{ code: string; city: string } | null>(null);
  // The request on screen: a reload (after `Send now`, `Try again`) keeps it while it asks, and waits for nothing.
  const shown = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [sendNote, setSendNoteState] = useState<string | null>(null);
  const [pastHero, setPastHero] = useState(false);
  // Said aloud too: a screen reader would otherwise not hear that the request did not go. iOS queues it behind what
  // VoiceOver is saying (the button coming back from busy); Android reads the live region the note sits in.
  const setSendNote = (note: string | null) => {
    setSendNoteState(note);
    if (note && Platform.OS === "ios") AccessibilityInfo.announceForAccessibilityWithOptions(note, { queue: true });
  };
  const [reloadToken, setReloadToken] = useState(0);
  const navigation = useNavigation();
  // After an await the member may have left (a tab, Back, another request opened on top): then nothing more happens
  // on their screen — no navigation, no note.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const here = () => alive.current && navigation.isFocused();
  // One Send now at a time: a second tap while the first still checks the network does nothing.
  const sendingNow = useRef(false);
  // Another request opened in this screen shows its own skeleton, never the last one's page.
  const current = loaded?.vm.id === id ? loaded : null;
  const codes = current ? routeCodes(current.vm.route) : null;
  const to = codes?.to ?? null;
  const originCity = origin && origin.code === codes?.from ? origin.city : null;
  const photoFor = usePlacePhotos([to]);

  // Opened from a link with nothing beneath (a push at cold start): Back lands on Requests rather than nowhere.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(REQUESTS));

  useEffect(() => {
    if (!id || typeof id !== "string") {
      setError({ ...stateCopy("route"), body: "This request could not be found." });
      setLoading(false);
      return;
    }

    let cancelled = false;
    // The title names the origin by its city (11), which the request does not carry: it is looked up by its code. Only
    // the title waits on it, and it never fails the page.
    const lookUpOrigin = async (vm: RequestVM): Promise<void> => {
      const from = routeCodes(vm.route)?.from;
      if (!from) return;
      const airport = await airportByCode(from).catch(() => null);
      if (!cancelled && airport) setOrigin({ code: from, city: airport.city });
    };

    void (async () => {
      setLoading(true);
      if (isQueuedId(id)) {
        const item = getQueued(id);
        if (cancelled) return;
        if (!item) {
          // Sent meanwhile (a flush from elsewhere), or removed: the queue no longer holds it.
          setError({ ...stateCopy("route"), body: "This request is no longer waiting on your phone." });
          setLoaded(null);
          setLoading(false);
          return;
        }
        // Most often offline: the page shows at once, and the title takes the origin's city if it comes.
        const vm = queuedView(item);
        shown.current = id;
        setLoaded({ kind: "queued", vm, rejected: Boolean(item.rejectedAt) });
        setError(null);
        setLoading(false);
        await lookUpOrigin(vm);
        return;
      }

      const result = await fetchRequest(id);
      if (cancelled) return;
      if (!result.ok) {
        setError(readFailureCopy(result.code, "request"));
        setLoaded(null);
        setLoading(false);
        return;
      }
      // A first answer waits a moment for the origin's city rather than change its title under the member's eyes.
      const lookup = lookUpOrigin(result.data);
      if (shown.current !== id) await Promise.race([lookup, wait(ORIGIN_WAIT_MS)]);
      if (cancelled) return;
      shown.current = id;
      setLoaded({ kind: "server", vm: result.data });
      setError(null);
      setLoading(false);
    })().catch(() => {
      if (!cancelled) {
        setError(stateCopy("route"));
        setLoaded(null);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [id, reloadToken]);

  async function onSendNow() {
    if (!id || typeof id !== "string" || sendingNow.current) return;
    sendingNow.current = true;
    setSendNote(null);
    setSending(true);
    try {
      if (isOffline(await NetInfo.fetch())) {
        // Nothing to try: offline costs no attempt, and the request goes as soon as the phone is back.
        if (here()) setSendNote(SEND_OFFLINE);
        return;
      }
      const result = await sendOne(id, (body, key) => submitRequest(body, key));
      if (!here()) return;
      const outcome = result.outcomes[id];
      if (outcome === "sent" || outcome === undefined) {
        // Sent — or sent meanwhile by another flush: back to the Requests already open beneath, which reloads on focus.
        router.dismissTo(REQUESTS);
        return;
      }
      if (outcome === "offline") setSendNote(SEND_OFFLINE);
      else if (outcome === "failed") setSendNote(SEND_LATER);
      // Refused for good: the reload shows what is left to do.
      setReloadToken((n) => n + 1);
    } finally {
      sendingNow.current = false;
      setSending(false);
    }
  }

  const backTop = insets.top + tokens.space.xs;

  // While it loads, the page keeps its photograph's place, its way back and the tab bar (ADR-IMPL-047); the words'
  // shapes shimmer where they will be (29). A reload keeps the request on screen instead: the `Send now` that asked
  // for it, and its note, stay where the member and a screen reader are.
  if (loading && !current) {
    return (
      <View style={styles.root}>
        <ScreenStatusBar on="light" />
        <View style={styles.hero}>
          <BackButton
            testID="request.back"
            variant="photo"
            onPress={goBack}
            style={StyleSheet.flatten([styles.back, { top: backTop }])}
          />
        </View>
        <View style={[styles.sheet, styles.grow]} testID="request.loading">
          <Skeleton width="80%" height={36} radius="pill" />
          <Skeleton width="60%" height={18} radius="pill" />
          <Skeleton width="45%" height={18} radius="pill" />
          <Skeleton height={88} radius="md" />
        </View>
        <RootTabBar active="requests" />
      </View>
    );
  }

  if (error || !current) {
    const copy = error ?? stateCopy("route");
    return (
      <View testID="request.root" style={[styles.root, { paddingTop: insets.top }]}>
        <ScreenStatusBar on="light" />
        <View style={styles.errorTop}>
          <BackButton testID="request.back" variant="tint" onPress={goBack} />
        </View>
        <View style={[styles.grow, styles.centered]}>
          <ErrorState
            testID="request.error"
            title={copy.title}
            body={copy.body}
            align="center"
            primary={{ label: "Try again", testID: "request.error.retry", onPress: () => setReloadToken((n) => n + 1) }}
            secondary={{ label: "Back", testID: "request.error.back", onPress: goBack }}
          />
        </View>
        <RootTabBar active="requests" />
      </View>
    );
  }

  const vm = current.vm;
  const state = current.kind === "queued" ? (current.rejected ? "rejected" : "queued") : serverState(vm);
  const view = requestView(state, vm.status === "closed" ? closedAt(vm) : null);
  const caption = stepCaption(state, view, vm.timeline);
  const steps = progressSteps(state, vm);
  const lines = detailLines(vm);
  const phone = view.callback ? displayPhone(vm.phone) : null;
  // 11: the fare a quote is ready for — the published fare beside it only with its source, as the server recorded both
  // when the member asked (ADR-IMPL-046).
  const fare =
    view.fare && vm.priceAtRequest != null
      ? {
          offer: vm.priceAtRequest,
          ...(vm.publishedAtRequest
            ? { published: vm.publishedAtRequest.amount, publishedSource: vm.publishedAtRequest.source }
            : {}),
          currency: "USD",
        }
      : null;
  const reference = vm.reference.trim();
  // A call needs the club's verified number (EXPO_PUBLIC_SUPPORT_PHONE, in digits); without one, no button.
  const call = view.call ? telHref(env.EXPO_PUBLIC_SUPPORT_PHONE) : null;
  const dial = () => {
    if (call) Linking.openURL(call).catch(() => undefined);
  };
  const picture = bandPicture(null, photoFor(to), {
    headers: PICTURE_HEADERS,
    mapboxToken: env.EXPO_PUBLIC_MAPBOX_TOKEN,
    size: { width, height: HERO },
  });
  const credit = picture.credit;
  const creditLink = credit?.link ?? null;

  return (
    <View testID="request.root" style={styles.root}>
      {/* Light glyphs over the photograph; dark ones once the page has scrolled past it. */}
      <ScreenStatusBar on={pastHero ? "light" : "dark"} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const past = e.nativeEvent.contentOffset.y > HERO - OVERLAP - insets.top;
          if (past !== pastHero) setPastHero(past);
        }}
      >
        <View style={styles.hero}>
          <Photo
            source={picture.source}
            fallback={CLUB_PICTURE}
            cachePolicy={picture.cache}
            style={StyleSheet.absoluteFill}
            testID="request.photo"
          />
          <BackButton
            testID="request.back"
            variant="photo"
            onPress={goBack}
            style={StyleSheet.flatten([styles.back, { top: backTop }])}
          />
        </View>

        <View style={styles.sheet}>
          {/* 11: the route by its cities, the trip's facts under it; 32, 33: the badge beside the title. */}
          <View style={styles.heading}>
            <View style={styles.titleRow}>
              <Text testID="request.title" accessibilityRole="header" style={styles.title} numberOfLines={2}>
                {detailTitle(vm, originCity)}
              </Text>
              {view.titleBadge ? <StatusBadge status={view.badge} size="sm" /> : null}
            </View>
            <View testID="request.facts" style={styles.facts}>
              {lines.map((line, i) => (
                <Text key={line} style={i === 0 ? styles.factsFirst : styles.factsLine}>
                  {line}
                </Text>
              ))}
              {view.closedLine ? (
                <Text testID="request.closed" style={styles.factsLine}>
                  {view.closedLine}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.progress}>
            <Text style={styles.section} accessibilityRole="header">
              Request progress
            </Text>
            <Timeline testID="request.timeline" steps={steps} />
          </View>

          {view.notice || caption ? (
            <View style={styles.group}>
              {view.notice ? (
                <InfoCard
                  testID="request.notice"
                  icon={view.notice.icon}
                  title={view.notice.title}
                  body={view.notice.body ?? undefined}
                />
              ) : null}
              {caption ? (
                // What comes next — or the specialist's note on where the request is (ADR-IMPL-041).
                <Text testID="request.caption" style={styles.caption}>
                  {caption}
                </Text>
              ) : null}
            </View>
          ) : null}

          {fare || view.callback ? (
            // 11: the fare, the number we call and the booking note, 8 pt apart.
            <View testID="request.callback" style={styles.callback}>
              {fare ? <YourFareCard testID="request.fare" price={fare} percent={savingPercent(fare)} /> : null}
              {phone ? <CallbackCard phone={phone} /> : null}
              {view.callback ? <Text style={styles.note}>{BOOKING_NOTE}</Text> : null}
            </View>
          ) : null}

          {view.call === "specialist" && call ? (
            <Button testID="request.call" label="Call your specialist" icon="phone" variant="primary" onPress={dial} />
          ) : null}

          {view.call === "us" && call ? (
            // A request we could not pass on: the call is the one thing left.
            <Button testID="request.callUs" label="Call us" icon="phone" variant="primary" onPress={dial} />
          ) : null}

          {view.sendNow ? (
            <View>
              <Button
                testID="request.send"
                label={sending ? "Sending…" : "Send now"}
                variant="primary"
                busy={sending}
                onPress={() => {
                  void onSendNow().catch(() => {
                    if (here()) setSendNote(SEND_LATER);
                  });
                }}
              />
              {/* Mounted while Send now shows, so Android hears the note arrive in it. */}
              <View accessibilityLiveRegion="polite">
                {sendNote ? (
                  <Text testID="request.send.note" style={[styles.note, styles.sendNote]}>
                    {sendNote}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          {credit || reference ? (
            <View style={styles.footer}>
              {credit ? (
                // The credit the photograph owes (ADR-IMPL-043).
                <PhotoCredit
                  testID="request.photoCredit"
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
              {reference ? (
                // The reference a member reads out on the phone (the owner keeps it, 14 Oct).
                <Text testID="request.reference" style={styles.reference}>
                  REF {reference}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
      <RootTabBar active="requests" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  grow: { flex: 1 },
  centered: { alignItems: "center", justifyContent: "center", paddingHorizontal: tokens.space.gutter },
  scroll: { paddingBottom: tokens.space.lg },
  hero: { height: HERO, backgroundColor: tokens.colors.surfaceTint },
  back: { position: "absolute", left: tokens.space.gutter },
  errorTop: { paddingHorizontal: tokens.space.gutter, paddingTop: tokens.space.xs },
  // 11: the sheet over the photograph's foot, its corners 24 pt.
  sheet: {
    marginTop: -OVERLAP,
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    backgroundColor: tokens.colors.surfacePage,
    paddingHorizontal: tokens.space.gutter,
    paddingTop: tokens.space.lg,
    gap: tokens.space.lg,
  },
  heading: { gap: tokens.space.xs },
  // 32, 33: the badge at the right of the title; a title too long for both sends the badge under it rather than break
  // the route in two.
  titleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: tokens.space.sm,
    rowGap: tokens.space.xs,
  },
  title: { ...rn(tokens.type.display), color: tokens.colors.textPrimary, flexShrink: 1 },
  facts: { gap: 2 },
  factsFirst: { ...rn(tokens.type.bodyLg), color: tokens.colors.textSecondary },
  factsLine: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
  progress: { gap: tokens.space.md },
  section: { ...rn(tokens.type.title), color: tokens.colors.textPrimary },
  group: { gap: tokens.space.md },
  caption: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
  callback: { gap: tokens.space.xs },
  callbackCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
    padding: tokens.space.md,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.surfaceCard,
    ...tokens.elevation.card,
  },
  callbackIcon: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.borderDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  callbackLabel: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  callbackPhone: { ...rn(tokens.type.titleSm), color: tokens.colors.textPrimary },
  note: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary },
  sendNote: { marginTop: tokens.space.xs },
  footer: { gap: tokens.space.xs },
  reference: { ...rn(tokens.type.label), color: tokens.colors.textSecondary },
});
