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
  QuoteFareCard,
  Skeleton,
  StatusBadge,
  TIMELINE_HEIGHT,
  TIMELINE_LABEL_BASELINE,
  Timeline,
  baselineOffset,
  belowBaseline,
  tokens,
  rn,
} from "@bbc/ui";

import { RootTabBar } from "@/components/RootTabBar";
import { ScreenStatusBar, heroImageKey, statusBarOn } from "@/components/screen-status-bar";
import { isOffline } from "@/features/explore/offline-logic";
import { bandPicture } from "@/features/places/place-photo-logic";
import { clubPhoto } from "@/features/places/club-photos";
import { PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";
import { telHref } from "@/features/requests/confirmation-logic";
import { detailLines, detailTitle, queuedView, routeCodes } from "@/features/requests/request-card";
import { isRequestId, requestFailureFrame, type RequestFailureAction } from "@/features/requests/request-failure";
import { closedAt, progressSteps, requestView, serverState, stepCaption } from "@/features/requests/request-view-logic";
import { airportByCode } from "@/lib/airport-by-code";
import { fetchRequest, submitRequest } from "@/lib/api";
import { env } from "@/lib/env";
import { stateCopy } from "@/lib/error-context";
import { displayPhone } from "@/lib/phone";
import { getQueued, sendOne } from "@/lib/queue";
import { savingPercent } from "@/lib/saving";

/** 11: the line under the number we call. */
const BOOKING_NOTE = "Your specialist confirms availability and books by phone.\nNo payment is taken in the app.";

/** Under `Send now` when it did not go: still offline; the club's server not answering while the phone is online (never
 *  "offline", F110); or the server did not take it this time. */
const SEND_OFFLINE = "You’re still offline. It goes out as soon as you’re back.";
const SEND_UNREACHABLE = "We can’t reach the club right now. It goes out as soon as it answers.";
const SEND_LATER = "It didn’t go through. We’ll try again in a few minutes.";

const REQUESTS = "/(tabs)/requests" as Href;

/**
 * 11, measured on a 47-pt status bar: the photograph from the screen's top; the sheet's top 175.6 pt under the safe
 * area, its corners 12.5 over the photograph; the 35-pt back button centred 5.1 pt under the safe area, 19.2 in.
 */
const SHEET_TOP = 175.6;
const CORNER = 12.5;
const BACK = { diameter: 35, left: 19.2, centre: 5.1 } as const;
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

/**
 * 11, 30, 31, 33: `We will call` and the member's number, measured (card top T): white, radius 11.5, the card shadow,
 * 51.6 tall; the 36-pt circle 16.6 in with the filled handset; the words 69 pt in, `We will call` with its baseline
 * T+20.9 and the number T+41.7.
 */
function CallbackCard({ phone }: { phone: string }) {
  return (
    <View style={styles.callbackCard} accessible accessibilityLabel={`We will call ${phone}`}>
      <View style={styles.callbackIcon}>
        <Icon name="phone-fill" size={17.7} color={tokens.colors.textPrimary} />
      </View>
      <View style={styles.callbackText}>
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
  // What the failure frame says, and what it offers: `Try again`, or only the way back to Requests for a request that
  // is not there to load (F015).
  const [error, setError] = useState<{ title: string; body: string; actions: RequestFailureAction[] } | null>(null);
  const [sending, setSending] = useState(false);
  const [sendNote, setSendNoteState] = useState<string | null>(null);
  const [pastHero, setPastHero] = useState(false);
  // The photograph as last drawn (or not), by which one it was: the status bar's glyphs follow it (F028).
  const [heroDrawn, setHeroDrawn] = useState<{ key: string | null; ok: boolean } | null>(null);
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
      setError(requestFailureFrame({ status: 404 }));
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
          // Asking again cannot bring it back: the way out is Requests, where a request sent meanwhile is listed.
          setError({
            ...stateCopy("route"),
            body: "This request is no longer waiting on your phone.",
            actions: ["backToRequests"],
          });
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
      // An id no request can have (a link anyone can write): there is nothing to ask the server for.
      if (!isRequestId(id)) {
        setError(requestFailureFrame({ status: 404 }));
        setLoaded(null);
        setLoading(false);
        return;
      }

      const result = await fetchRequest(id);
      if (cancelled) return;
      if (!result.ok) {
        setError(requestFailureFrame(result));
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
        setError({ ...stateCopy("route"), actions: ["retry"] });
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
      // The platform said online a moment ago: no answer now is the club's server, not this phone.
      if (outcome === "offline") setSendNote(SEND_UNREACHABLE);
      else if (outcome === "failed") setSendNote(SEND_LATER);
      // Refused for good: the reload shows what is left to do.
      setReloadToken((n) => n + 1);
    } finally {
      sendingNow.current = false;
      setSending(false);
    }
  }

  // The page's frame as 11 draws it, on this phone's status bar.
  const sheetTop = insets.top + SHEET_TOP;
  const heroHeight = sheetTop + CORNER;
  const backTop = insets.top + BACK.centre - BACK.diameter / 2;
  const back = (
    <BackButton
      testID="request.back"
      variant="glass"
      diameter={BACK.diameter}
      glyph={{ size: 24, stroke: 1.6 }}
      onPress={goBack}
      style={StyleSheet.flatten([styles.back, { top: backTop }])}
    />
  );

  // While it loads, the page keeps its photograph's place, its way back and the tab bar (ADR-IMPL-047); the words'
  // shapes shimmer where they will be (29). A reload keeps the request on screen instead: the `Send now` that asked
  // for it, and its note, stay where the member and a screen reader are.
  if (loading && !current) {
    return (
      <View style={styles.root}>
        <ScreenStatusBar on="light" />
        <View style={[styles.hero, { height: heroHeight }]}>{back}</View>
        <View style={[styles.sheet, styles.grow, styles.loadingSheet]} testID="request.loading">
          <Skeleton width="80%" height={30} radius="pill" />
          <Skeleton width="60%" height={16} radius="pill" />
          <Skeleton width="45%" height={16} radius="pill" />
          <Skeleton height={74} radius="md" />
        </View>
        <RootTabBar active="requests" />
      </View>
    );
  }

  if (error || !current) {
    const copy = error ?? { ...stateCopy("route"), actions: ["retry"] };
    const retry = copy.actions.includes("retry");
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
            primary={
              retry
                ? { label: "Try again", testID: "request.error.retry", onPress: () => setReloadToken((n) => n + 1) }
                : {
                    label: "Back to Requests",
                    testID: "request.error.requests",
                    // Back down to the Requests tab beneath, as `Send now` does; with nothing beneath (a link at cold
                    // start) it takes this page's place. `replace` would put a second tab bar over the first.
                    onPress: () => router.dismissTo(REQUESTS),
                  }
            }
            secondary={retry ? { label: "Back", testID: "request.error.back", onPress: goBack } : undefined}
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
  // The design's own photograph of the city where it has one (ADR-IMPL-056), else the server's place photo.
  const bundled = clubPhoto(to, "any");
  const picture = bandPicture(null, photoFor(to), {
    headers: PICTURE_HEADERS,
    mapboxToken: env.EXPO_PUBLIC_MAPBOX_TOKEN,
    size: { width, height: heroHeight },
  });
  const heroImage = bundled ?? picture.source;
  const heroKey = heroImageKey(heroImage);
  const heroLoaded = heroDrawn !== null && heroDrawn.key === heroKey && heroDrawn.ok;
  const credit = bundled ? null : picture.credit;
  const creditLink = credit?.link ?? null;
  const notice = view.notice
    ? { ...view.notice, glyph: view.notice.icon === "info" ? ("info-fill" as const) : ("phone-fill" as const) }
    : null;
  // What follows the notice: the line under it, then the fare, the number we call and the booking note, then the call.
  const pill =
    view.call === "specialist" && call ? (
      <Button
        testID="request.call"
        label="Call your specialist"
        icon="phone-fill"
        iconSize={21.4}
        iconGap={14.75}
        variant="primary"
        height={PILL_HEIGHT}
        text="buttonDetail"
        onPress={dial}
        style={styles.pill}
      />
    ) : view.call === "us" && call ? (
      // A request we could not pass on: the call is the one thing left.
      <Button
        testID="request.callUs"
        label="Call us"
        icon="phone-fill"
        iconSize={21.4}
        iconGap={14.75}
        variant="primary"
        height={PILL_HEIGHT}
        text="buttonDetail"
        onPress={dial}
        style={styles.pill}
      />
    ) : null;

  return (
    <View testID="request.root" style={styles.root}>
      {/* Light glyphs over the photograph once it is drawn; dark ones over the tint without one (a city without a
          photograph, loading or failed), and once the page has scrolled past it (F028). */}
      <ScreenStatusBar on={statusBarOn({ hasImage: heroKey !== null, loaded: heroLoaded, pastHero })} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const past = e.nativeEvent.contentOffset.y > sheetTop - insets.top;
          if (past !== pastHero) setPastHero(past);
        }}
      >
        <View style={[styles.hero, { height: heroHeight }]}>
          <Photo
            source={heroImage}
            fallback={null}
            cachePolicy={bundled ? "disk" : picture.cache}
            style={StyleSheet.absoluteFill}
            onLoad={() => setHeroDrawn({ key: heroKey, ok: true })}
            onError={() => setHeroDrawn({ key: heroKey, ok: false })}
            testID="request.photo"
          />
          {back}
        </View>

        <View style={styles.sheet}>
          {/* 11: the route by its cities, the trip's facts under it; 32, 33: the badge beside the title. */}
          <View style={styles.titleRow}>
            <Text testID="request.title" accessibilityRole="header" style={styles.title} numberOfLines={2}>
              {detailTitle(vm, originCity)}
            </Text>
            {view.titleBadge ? (
              <View style={styles.titleBadge}>
                <StatusBadge status={view.badge} size="title" />
              </View>
            ) : null}
          </View>
          <View testID="request.facts">
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

          <Text style={styles.section} accessibilityRole="header">
            Request progress
          </Text>
          <View style={styles.timeline}>
            <Timeline testID="request.timeline" steps={steps} />
          </View>

          {notice ? (
            <View style={styles.notice}>
              <InfoCard
                testID="request.notice"
                look="detail"
                icon={notice.glyph}
                title={notice.title}
                body={notice.body ?? undefined}
              />
            </View>
          ) : null}
          {caption ? (
            // What comes next — or the specialist's note on where the request is (ADR-IMPL-041).
            <Text testID="request.caption" style={styles.caption}>
              {caption}
            </Text>
          ) : null}

          {fare || view.callback ? (
            // 11: the fare, the number we call and the booking note.
            <View testID="request.callback" style={caption ? styles.callbackAfterCaption : styles.callbackAfterNotice}>
              {fare ? <QuoteFareCard testID="request.fare" price={fare} percent={savingPercent(fare)} /> : null}
              {phone ? (
                <View style={fare ? styles.callAfterFare : null}>
                  <CallbackCard phone={phone} />
                </View>
              ) : null}
              {view.callback ? <Text style={styles.note}>{BOOKING_NOTE}</Text> : null}
            </View>
          ) : null}

          {pill ? <View style={view.callback ? styles.pillAfterNote : styles.pillAfterNotice}>{pill}</View> : null}

          {view.sendNow ? (
            <View style={styles.pillAfterNotice}>
              <Button
                testID="request.send"
                label={sending ? "Sending…" : "Send now"}
                variant="primary"
                busy={sending}
                height={PILL_HEIGHT}
                text="buttonDetail"
                style={styles.pill}
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

/**
 * 11, measured from the sheet's top T (pt): the cards and the pill 19.2 in, the words 23; the title's baseline T+44.2,
 * the days' 23.3 under it, the route's 20.3 under those (a closed day 21.7 under that); `Request progress` 38.5 under
 * the last; the marks' centre 27.7 under it; the notice 30.2 under the steps' names; its line 26.1 under the notice;
 * the first card 13.2 under the line (18.5 under the notice when there is no line); the number's card 7.5 under the
 * fare; the booking note's baselines 14.5 under the cards, 13.9 apart; the pill 40.2 tall, 10.3 under the note
 * (10.2 under the notice for `Send now`, 32).
 */
const GUTTER = 19.2;
const TEXT_IN = 23 - GUTTER;
const PILL_HEIGHT = 40.2;
const title = tokens.type.headline;
const facts = tokens.type.detailFacts;
const meta = tokens.type.detailMeta;
const section = tokens.type.detailSection;
const caption = tokens.type.detailCaption;
const fine = tokens.type.finePrint;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfaceSheet },
  grow: { flex: 1 },
  centered: { alignItems: "center", justifyContent: "center", paddingHorizontal: tokens.space.gutter },
  scroll: { paddingBottom: tokens.space.lg },
  hero: { backgroundColor: tokens.colors.surfaceTint },
  back: { position: "absolute", left: BACK.left },
  errorTop: { paddingHorizontal: tokens.space.gutter, paddingTop: tokens.space.xs },
  // 11: the sheet over the photograph's foot, its corners 12.5 pt, near-white.
  sheet: {
    marginTop: -CORNER,
    borderTopLeftRadius: CORNER,
    borderTopRightRadius: CORNER,
    backgroundColor: tokens.colors.surfaceSheet,
    paddingHorizontal: GUTTER,
  },
  loadingSheet: { paddingTop: tokens.space.lg, gap: tokens.space.md },
  // 32, 33: the badge at the right of the title, its middle on the title's capitals; a title too long for both sends
  // the badge under it rather than break the route in two.
  titleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between" },
  title: {
    ...rn(title),
    color: tokens.colors.textPrimary,
    flexShrink: 1,
    marginLeft: TEXT_IN,
    marginTop: 44.2 - baselineOffset(title),
  },
  // 32: the badge's middle on the title's capitals (0.36 of the size above the baseline), its right edge 2.7 pt in.
  titleBadge: { marginTop: 44.2 - 0.36 * title.fontSize - 26.7 / 2, marginRight: 2.7 },
  factsFirst: {
    ...rn(facts),
    color: tokens.colors.textSecondary,
    marginLeft: TEXT_IN,
    marginTop: 23.3 - belowBaseline(title) - baselineOffset(facts),
  },
  factsLine: {
    ...rn(meta),
    color: tokens.colors.textSecondary,
    marginLeft: TEXT_IN,
    marginTop: 20.3 - belowBaseline(facts) - baselineOffset(meta),
  },
  section: {
    ...rn(section),
    color: tokens.colors.textPrimary,
    marginLeft: TEXT_IN,
    marginTop: 38.5 - belowBaseline(meta) - baselineOffset(section),
  },
  timeline: { marginTop: 27.7 - belowBaseline(section) - 13.75 },
  notice: { marginTop: 30.2 - (TIMELINE_HEIGHT - TIMELINE_LABEL_BASELINE) },
  caption: {
    ...rn(caption),
    color: tokens.colors.textSecondary,
    marginLeft: TEXT_IN + 1.3,
    marginTop: 26.1 - baselineOffset(caption),
  },
  callbackAfterCaption: { marginTop: 13.2 - belowBaseline(caption) },
  callbackAfterNotice: { marginTop: 18.5 },
  callAfterFare: { marginTop: 7.5 },
  callbackCard: {
    height: 51.6,
    borderRadius: 11.5,
    backgroundColor: tokens.colors.surfaceCard,
    ...tokens.elevation.card,
  },
  callbackIcon: {
    position: "absolute",
    left: 16.6,
    top: (51.6 - 36) / 2,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.colors.callCircle,
    alignItems: "center",
    justifyContent: "center",
  },
  callbackText: { marginLeft: 69 },
  callbackLabel: {
    ...rn(tokens.type.callLabel),
    color: tokens.colors.textSecondary,
    marginTop: 20.9 - baselineOffset(tokens.type.callLabel),
  },
  callbackPhone: {
    ...rn(tokens.type.callPhone),
    color: tokens.colors.textPrimary,
    marginTop: 20.8 - belowBaseline(tokens.type.callLabel) - baselineOffset(tokens.type.callPhone),
  },
  note: {
    ...rn(fine),
    color: tokens.colors.textSecondary,
    marginLeft: TEXT_IN + 1.7,
    marginTop: 14.5 - baselineOffset(fine),
  },
  pillAfterNote: { marginTop: 10.3 - belowBaseline(fine) },
  pillAfterNotice: { marginTop: 10.2 },
  pill: { alignSelf: "stretch" },
  sendNote: { marginTop: tokens.space.xs },
  footer: { gap: tokens.space.xs, marginTop: tokens.space.lg },
  reference: { ...rn(tokens.type.label), color: tokens.colors.textSecondary },
});
