import NetInfo from "@react-native-community/netinfo";
import type { RequestVM } from "@bbc/shared/api/v1/requests";
import { useLocalSearchParams, useNavigation, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BackButton, Button, ErrorState, PricePair, SectionLabel, StatusBadge, Timeline, tokens, rn } from "@bbc/ui";

import { RootTabBar } from "@/components/RootTabBar";
import { isOffline } from "@/features/explore/offline-logic";
import { telHref } from "@/features/requests/confirmation-logic";
import { detailFacts, queuedView, requestTitle } from "@/features/requests/request-card";
import { closedAt, requestView } from "@/features/requests/request-view-logic";
import { fetchRequest, submitRequest } from "@/lib/api";
import { readFailureCopy, stateCopy } from "@/lib/error-context";
import { env } from "@/lib/env";
import { displayPhone } from "@/lib/phone";
import { getQueued, sendOne } from "@/lib/queue";

/** Figma 233:4246: the line under the number we call. */
const BOOKING_NOTE = "Your specialist confirms availability and books by phone. No payment is taken in the app.";

/** Under `Send now` when it did not go: still offline, or the server did not take it this time. */
const SEND_OFFLINE = "You’re still offline. It goes out as soon as you’re back.";
const SEND_LATER = "It didn’t go through. We’ll try again in a few minutes.";

const REQUESTS = "/(tabs)/requests" as Href;

function isQueuedId(id: string): boolean {
  return id.startsWith("q_");
}

type Loaded =
  | { kind: "server"; vm: RequestVM }
  // A request still on the phone: waiting to go, or refused by the server for good.
  | { kind: "queued"; vm: RequestVM; rejected: boolean };

export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [sendNote, setSendNoteState] = useState<string | null>(null);
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

  // Opened from a link with nothing beneath (a push at cold start): Back lands on Requests rather than nowhere.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(REQUESTS));

  useEffect(() => {
    if (!id || typeof id !== "string") {
      setError({ ...stateCopy("route"), body: "This request could not be found." });
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      setLoading(true);
      if (isQueuedId(id)) {
        const item = getQueued(id);
        if (cancelled) return;
        if (!item) {
          // Sent meanwhile (a flush from elsewhere), or removed: the queue no longer holds it.
          setError({ ...stateCopy("route"), body: "This request is no longer waiting on your phone." });
          setLoaded(null);
        } else {
          setLoaded({ kind: "queued", vm: queuedView(item), rejected: Boolean(item.rejectedAt) });
          setError(null);
        }
        setLoading(false);
        return;
      }

      const result = await fetchRequest(id);
      if (cancelled) return;
      if (!result.ok) {
        setError(readFailureCopy(result.code, "request"));
        setLoaded(null);
      } else {
        setLoaded({ kind: "server", vm: result.data });
        setError(null);
      }
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

  if (loading) {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator color={tokens.colors.primary} />
      </View>
    );
  }

  if (error || !loaded) {
    const copy = error ?? stateCopy("route");
    return (
      <View testID="request.root" style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <ErrorState
          testID="request.error"
          variant="error"
          title={copy.title}
          body={copy.body}
          primary={{ label: "Try again", testID: "request.error.retry", onPress: () => setReloadToken((n) => n + 1) }}
          secondary={{ label: "Back", testID: "request.error.back", onPress: goBack }}
        />
      </View>
    );
  }

  const vm = loaded.vm;
  const state = loaded.kind === "queued" ? (loaded.rejected ? "rejected" : "queued") : vm.status;
  const view = requestView(state, vm.status === "closed" ? closedAt(vm) : null);
  const callback = view.callback ? displayPhone(vm.phone) : null;
  // A call needs the club's verified number (EXPO_PUBLIC_SUPPORT_PHONE, in digits); without one, no button.
  const call = view.call ? telHref(env.EXPO_PUBLIC_SUPPORT_PHONE) : null;
  const dial = () => {
    if (call) Linking.openURL(call).catch(() => undefined);
  };

  return (
    <View testID="request.root" style={styles.root}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + tokens.space.md,
          paddingHorizontal: tokens.space.lg,
          paddingBottom: insets.bottom + tokens.space.xxl,
          // Figma 325:8295 (not sent): 16 pt between the groups; every other detail frame, 24.
          gap: view.compact ? tokens.space.md : tokens.space.lg,
        }}
      >
        {/* Figma 233:4174: back, the city, the trip's facts, its state — 12 pt apart. */}
        <View style={styles.heading}>
          <BackButton testID="request.back" onPress={goBack} />
          <Text testID="request.title" accessibilityRole="header" style={styles.title} numberOfLines={2}>
            {requestTitle(vm)}
          </Text>
          <Text testID="request.facts" style={styles.facts}>
            {detailFacts(vm)}
          </Text>
          {view.badge ? <StatusBadge status={view.badge} size="sm" /> : null}
          {view.closedLine ? (
            <Text testID="request.closed" style={styles.closed}>
              {view.closedLine}
            </Text>
          ) : null}
        </View>

        {view.sentence || vm.priceAtRequest != null || vm.reference.trim().length > 0 ? (
          <View style={styles.group}>
            {view.sentence ? (
              <Text testID="request.sentence" style={styles.sentence}>
                {view.sentence}
              </Text>
            ) : null}
            {vm.priceAtRequest != null ? (
              // Figma 233:4204 colours this fare bronze; DESIGN.md keeps `accent-warm` to the selected pin, a fare row's
              // offer and the Requests dot. The canonical file wins until the owner says otherwise (ADR-IMPL-041, A2c).
              <PricePair price={{ offer: vm.priceAtRequest, currency: "USD" }} layout="detail" />
            ) : null}
            {vm.reference.trim().length > 0 ? (
              <Text testID="request.reference" style={styles.reference}>
                REF {vm.reference}
              </Text>
            ) : null}
          </View>
        ) : null}

        {view.showTimeline ? (
          <View style={styles.progress}>
            {/* Figma 233:4248, 233:4171, 233:4388 name the section; 325:8136 (review) and 325:8295 (not sent) do not. */}
            {view.progressLabel ? <SectionLabel label="Request progress" flush /> : null}
            <Timeline
              testID="request.timeline"
              status={view.timelineStatus}
              events={vm.timeline}
              currentCaption={view.caption}
            />
          </View>
        ) : null}

        {view.callback ? (
          // Figma 233:4242: the section's name, the number we call, the booking note — 8 pt apart.
          <View testID="request.callback" style={styles.callback}>
            {callback ? (
              <>
                <SectionLabel label="We will call" flush />
                <Text testID="request.callback.phone" style={styles.phone}>
                  {callback}
                </Text>
              </>
            ) : null}
            <Text style={styles.note}>{BOOKING_NOTE}</Text>
            {view.call === "specialist" && call ? (
              // Figma 296:5916: a white pill on a hairline.
              <Button
                testID="request.call"
                label="Call your specialist"
                shape="pill"
                variant="ghost"
                onPress={dial}
                style={styles.call}
              />
            ) : null}
          </View>
        ) : null}

        {view.call === "us" && call ? (
          // A request we could not pass on: the call is the one thing left, the screen's one filled button.
          <Button testID="request.callUs" label="Call us" shape="pill" variant="primary" onPress={dial} />
        ) : null}

        {view.sendNow ? (
          <View>
            <Button
              testID="request.send"
              label="Send now"
              shape="pill"
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
      </ScrollView>
      <View style={{ paddingBottom: insets.bottom }}>
        <RootTabBar active="requests" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  centered: { alignItems: "center", justifyContent: "center", padding: tokens.space.lg },
  heading: { gap: tokens.space.sm, alignItems: "flex-start" },
  title: { ...rn(tokens.type.display), color: tokens.colors.textPrimary, alignSelf: "stretch" },
  facts: { ...rn(tokens.type.factsMono), color: tokens.colors.textSecondary },
  closed: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary },
  group: { gap: tokens.space.sm },
  progress: { gap: tokens.space.lg },
  sentence: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
  reference: { ...rn(tokens.type.labelMono), color: tokens.colors.textSecondary },
  // Figma 233:4242: the section's name, the number, the booking note and the call, 8 pt apart.
  callback: { gap: tokens.space.xs },
  phone: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
  note: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary },
  // Figma 296:5916: a white pill on a hairline — the screen's one filled button stays `Send now`.
  call: { backgroundColor: tokens.colors.surfaceCard },
  sendNote: { marginTop: tokens.space.xs },
});
