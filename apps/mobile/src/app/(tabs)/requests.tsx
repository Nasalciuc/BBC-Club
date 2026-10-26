import NetInfo from "@react-native-community/netinfo";
import { useIsFocused, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RequestVM } from "@bbc/shared/api/v1/requests";
import {
  CHIP_SLOP,
  CardSkeleton,
  Chip,
  EmptyState,
  InfoCard,
  NoticeCard,
  RequestCard,
  baselineOffset,
  belowBaseline,
  rn,
  tokens,
} from "@bbc/ui";

import emptyIllustration from "@/assets/images/club/illustrations/requests-empty.webp";
import { ScreenStatusBar } from "@/components/screen-status-bar";
import { isOffline } from "@/features/explore/offline-logic";
import { cardPicture } from "@/features/places/place-photo-logic";
import { clubPhoto } from "@/features/places/club-photos";
import { PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";
import { queuedView, requestCard, type RequestCardModel } from "@/features/requests/request-card";
import {
  REQUEST_FILTERS,
  filterEmptyLine,
  inFilter,
  listAttention,
  type RequestFilter,
} from "@/features/requests/request-view-logic";
import { askUnreadQuotes, noteUnreadQuotes } from "@/features/requests/unread-quotes-store";
import { fetchRequests, submitRequest } from "@/lib/api";
import { readFailureCopy, refreshFailedLine } from "@/lib/error-context";
import { flushQueue, listQueued, subscribeQueue, type QueuedRequest } from "@/lib/queue";
import { CAN_CALL } from "@/lib/support-phone";

type Row = { id: string; status: string; card: RequestCardModel };

export default function RequestsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  // Null until the server has answered once: a failed first answer is an error, never "No requests yet."
  const [items, setItems] = useState<RequestVM[] | null>(null);
  const [queued, setQueued] = useState<QueuedRequest[]>(() => listQueued());
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<{ title: string; body: string; code?: string } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [filter, setFilter] = useState<RequestFilter>("all");
  const queuedCount = useRef(queued.length);

  // The list follows the server: each time the tab comes into view (a request made from Explore, a state changed by
  // the specialist), and below when the phone comes back online. Only the first load shows the skeletons; later ones
  // keep the list and its scroll where they are. Coming into view also sends what waits on the phone (one flush at a
  // time, lib/queue.ts).
  useEffect(() => {
    if (!focused) return;
    setReloadToken((n) => n + 1);
    void flushQueue((body, key) => submitRequest(body, key)).catch(() => undefined);
  }, [focused]);

  useEffect(() => {
    if (reloadToken === 0) return;
    let cancelled = false;
    void (async () => {
      // The dot's ticket is taken before asking: an older question than the number shown, or one asked before a change
      // of member, never sets it (unread-quotes-store.ts).
      const ticket = askUnreadQuotes();
      const result = await fetchRequests();
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setFailure({ ...readFailureCopy(result.code, "requests"), code: result.code });
        return;
      }
      setItems(result.data.items);
      setHasMore(result.data.hasMore);
      setFailure(null);
      noteUnreadQuotes(result.data.items, ticket);
    })().catch(() => {
      if (!cancelled) {
        setLoading(false);
        setFailure(readFailureCopy(undefined, "requests"));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  // Back online after being offline: reload. NetInfo calls the listener at once with the current state — that first
  // call only sets where we start from.
  useEffect(() => {
    let wasOffline: boolean | null = null;
    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = isOffline(state);
      if (wasOffline === true && !offline) setReloadToken((n) => n + 1);
      wasOffline = offline;
    });
    return () => unsubscribe();
  }, []);

  // The queue changes from anywhere (the app-wide flush, Send now, a new request saved offline): re-read it; when one
  // left the phone, the server has it now.
  useEffect(() => {
    const reread = () => {
      const next = listQueued();
      if (next.length < queuedCount.current) setReloadToken((n) => n + 1);
      queuedCount.current = next.length;
      setQueued(next);
    };
    const unsubscribe = subscribeQueue(reread);
    // A change between the first render's read and this subscription would otherwise be missed.
    reread();
    return unsubscribe;
  }, []);

  // 28: the requests on the phone first, then the server's in its order — in progress first (ADR-IMPL-042).
  const rows: Row[] = [
    ...queued.map((q) => {
      const onPhone = q.rejectedAt ? ("rejected" as const) : ("queued" as const);
      return { id: q.id, status: onPhone, card: requestCard(queuedView(q), undefined, onPhone) };
    }),
    ...(items ?? []).map((r) => ({ id: r.id, status: r.status, card: requestCard(r) })),
  ];
  const photoFor = usePlacePhotos(rows.map((row) => row.card.to));
  const shown = rows.filter((row) => inFilter(filter, row.card.badge));
  const empty = items !== null && rows.length === 0;
  const firstLoad = loading && items === null && queued.length === 0;
  const failedFirst = items === null && queued.length === 0 && failure !== null;
  const attention = listAttention(rows, CAN_CALL);
  const openRequest = (id: string) => router.push({ pathname: "/request/[id]", params: { id } } as Href);

  const title = (
    <View style={styles.heading}>
      <Text style={styles.title} accessibilityRole="header">
        Requests
      </Text>
      <Text style={styles.subtitle}>Journeys in good hands.</Text>
    </View>
  );
  // 10 draws the title larger over the empty page (43 pt, the line 19.5).
  const emptyTitle = (
    <View style={styles.emptyHeading}>
      <Text style={styles.emptyTitle} accessibilityRole="header">
        Requests
      </Text>
      <Text style={styles.emptySubtitle}>Journeys in good hands.</Text>
    </View>
  );

  // 10: a member with no request yet — the picture, the words and the way to Explore; no filters, nothing to filter.
  if (empty) {
    return (
      <View testID="requests.root" style={[styles.root, { paddingTop: insets.top }]}>
        <ScreenStatusBar on="light" />
        <ScrollView contentContainerStyle={styles.emptyPage}>
          {emptyTitle}
          {failure ? (
            // The list was empty when it last loaded; what is new since may be missing — said calmly.
            <Text testID="requests.reloadFailed" style={styles.line}>
              {refreshFailedLine(failure.code, true)}
            </Text>
          ) : null}
          <View style={styles.emptyState}>
            <EmptyState
              testID="requests.empty"
              look="requests"
              illustration={emptyIllustration}
              bleed={EMPTY_BLEED}
              title="No requests yet."
              body="Explore destinations and request a fare. Your requests will appear here."
              primary={{ label: "Explore", onPress: () => router.push("/(tabs)/explore" as Href) }}
            />
          </View>
        </ScrollView>
      </View>
    );
  }

  // Nothing to show and the server did not answer: say so, with a way to try again — a member with ten requests is
  // never told they have none (DESIGN.md: error and empty are separate frames; sheet 41, the error state).
  if (failedFirst) {
    return (
      <View testID="requests.root" style={[styles.root, { paddingTop: insets.top }]}>
        <ScreenStatusBar on="light" />
        <ScrollView contentContainerStyle={styles.page}>
          {title}
          <View style={styles.block}>
            <NoticeCard
              testID="requests.error"
              tone="error"
              title={failure.title}
              body={failure.body}
              link={{ label: "Try again", testID: "requests.error.retry", onPress: () => setReloadToken((n) => n + 1) }}
            />
          </View>
        </ScrollView>
      </View>
    );
  }

  const header = (
    <View>
      {title}
      {/* 09: the status filters, from the gutter to the screen's edge. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filters}
        contentContainerStyle={styles.filtersContent}
        testID="requests.filters"
      >
        {REQUEST_FILTERS.map((f) => (
          <Chip
            key={f.key}
            testID={`requests.filter.${f.key}`}
            variant="filter"
            label={f.label}
            selected={filter === f.key}
            onPress={() => setFilter(f.key)}
          />
        ))}
      </ScrollView>
      {attention && filter === "all" && !firstLoad ? (
        // 28: the requests that need the member, over the list — under All, where those requests are.
        <View style={styles.block}>
          <InfoCard
            testID="requests.attention"
            look="attention"
            icon="info"
            iconStyle="bare"
            title={attention.title}
            body={attention.body}
          />
        </View>
      ) : null}
      {/* The list stays; a reload that failed says so, calmly — what is shown may be out of date. With nothing loaded
          yet, the requests waiting on the phone stay on screen and the line says the rest did not load; Requests asks
          again each time it comes into view and when the phone is back online. */}
      {failure ? (
        <Text testID="requests.reloadFailed" style={styles.line}>
          {refreshFailedLine(failure.code, items !== null)}
        </Text>
      ) : null}
      <View style={attention && filter === "all" && !firstLoad ? styles.listTopAfterNotice : styles.listTop} />
    </View>
  );

  return (
    <View testID="requests.root" style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenStatusBar on="light" />
      <FlatList
        data={firstLoad ? [] : shown}
        keyExtractor={(row) => row.id}
        ListHeaderComponent={header}
        ListEmptyComponent={
          firstLoad ? (
            // 29: the cards' shapes while the list loads.
            <View style={styles.cards} testID="requests.loading">
              {[0, 1, 2, 3].map((n) => (
                <CardSkeleton key={n} />
              ))}
            </View>
          ) : filter !== "all" ? (
            <Text testID="requests.filterEmpty" style={styles.filterEmpty}>
              {filterEmptyLine(filter)}
            </Text>
          ) : null
        }
        ItemSeparatorComponent={Separator}
        ListFooterComponent={
          hasMore ? (
            <Text testID="requests.hasMore" style={styles.line}>
              Showing your 50 most recent
            </Text>
          ) : null
        }
        contentContainerStyle={styles.page}
        renderItem={({ item: row }) => {
          const card = row.card;
          return (
            <RequestCard
              testID={`requests.row.${row.id}`}
              photo={clubPhoto(card.to, "request") ?? cardPicture(null, photoFor(card.to), PICTURE_HEADERS)}
              fallback={null}
              city={card.city}
              route={card.route}
              dates={card.dates}
              badgeStatus={card.badge}
              note={card.note}
              trip={card.trip}
              travelers={card.travelers}
              accessibilityLabel={card.spoken}
              onPress={() => openRequest(row.id)}
            />
          );
        }}
      />
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

/**
 * 09 and 28, measured on a 47-pt status bar: `Requests` with its baseline 37.8 pt under it, its ink 20.3 pt in;
 * `Journeys in good hands.` 28.1 pt lower; the filters 22.4 pt under that, 12.2 pt in, 5 apart; the first card 19.9 pt
 * under the filters (28: the attention card 16.1 under them, the first card 12 under it); cards 10.8 pt from either
 * edge, 9.5 apart.
 */
const TITLE_BASELINE = 37.8;
const SUBTITLE_PITCH = 28.1;
const FILTERS_TOP = 22.4;
const CARDS_LEFT = 10.8;
/** 10's picture runs from 7 pt in to the screen's edge, past the 20-pt gutter of the words under it. */
const EMPTY_BLEED = { left: 7 - 20, right: -20 };
const display = tokens.type.display;
const bodyLg = tokens.type.bodyLg;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  page: { paddingHorizontal: CARDS_LEFT, paddingBottom: tokens.space.xl },
  heading: { paddingLeft: 20.3 - 1.7 - CARDS_LEFT },
  title: {
    ...rn(display),
    color: tokens.colors.textPrimary,
    marginTop: TITLE_BASELINE - baselineOffset(display),
  },
  subtitle: {
    ...rn(bodyLg),
    color: tokens.colors.textSecondary,
    marginTop: SUBTITLE_PITCH - belowBaseline(display) - baselineOffset(bodyLg),
    marginLeft: 0.2,
  },
  // The row is the chips' slop taller above and below, its margins giving it back: the chips stay where 09 draws
  // them, and their 44-pt targets fall inside the row, which clips touches at its edges.
  filters: {
    marginTop: FILTERS_TOP - belowBaseline(bodyLg) - CHIP_SLOP,
    marginBottom: -CHIP_SLOP,
    marginHorizontal: -CARDS_LEFT,
  },
  filtersContent: { paddingHorizontal: 12.2, paddingVertical: CHIP_SLOP, gap: 5 },
  block: { marginTop: 16.1 },
  listTop: { height: 19.9 },
  listTopAfterNotice: { height: 12 },
  cards: { gap: 9.5 },
  separator: { height: 9.5 },
  /**
   * 10: the gutter 20; `Requests` 43 pt, its baseline 51.1 pt under the status bar, its ink 22.1 pt in; the line 30 pt
   * lower; the illustration, the design's whole picture, a 386-pt square from x 7 at 13.9 pt under that line.
   */
  emptyPage: { paddingHorizontal: 20, paddingBottom: tokens.space.xl },
  emptyHeading: { paddingLeft: 22.1 - 2.0 - 20 },
  emptyTitle: {
    ...rn(tokens.type.displayLg),
    color: tokens.colors.textPrimary,
    marginTop: 51.1 - baselineOffset(tokens.type.displayLg),
  },
  emptySubtitle: {
    ...rn(tokens.type.subtitleLg),
    color: tokens.colors.textSecondary,
    marginTop: 30 - belowBaseline(tokens.type.displayLg) - baselineOffset(tokens.type.subtitleLg),
    marginLeft: -1.3,
  },
  emptyState: { marginTop: 13.9 - belowBaseline(tokens.type.subtitleLg) },
  // A message is `text-secondary`, never `status-danger` (DESIGN.md: that is for a field at fault only).
  line: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary, marginTop: tokens.space.md },
  filterEmpty: {
    ...rn(tokens.type.bodyLg),
    color: tokens.colors.textSecondary,
    textAlign: "center",
    marginTop: tokens.space.xl,
  },
});
