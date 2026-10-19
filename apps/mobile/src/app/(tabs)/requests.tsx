import NetInfo from "@react-native-community/netinfo";
import { useIsFocused, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RequestVM } from "@bbc/shared/api/v1/requests";
import { CardSkeleton, Chip, EmptyState, InfoCard, NoticeCard, RequestCard, tokens, rn } from "@bbc/ui";

import emptyIllustration from "@/assets/images/requests-empty.webp";
import { ScreenStatusBar } from "@/components/screen-status-bar";
import { isOffline } from "@/features/explore/offline-logic";
import { cardPicture } from "@/features/places/place-photo-logic";
import { CLUB_PICTURE, PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";
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

/** 10's picture: the seat, the window over London, the globe and the boarding pass — 853 by 810. */
const ILLUSTRATION_RATIO = 853 / 810;

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
  const attention = listAttention(rows);
  const openRequest = (id: string) => router.push({ pathname: "/request/[id]", params: { id } } as Href);

  const title = (
    <View style={styles.heading}>
      <Text style={styles.title} accessibilityRole="header">
        Requests
      </Text>
      <Text style={styles.subtitle}>Journeys in good hands.</Text>
    </View>
  );

  // 10: a member with no request yet — the picture, the words and the way to Explore; no filters, nothing to filter.
  if (empty) {
    return (
      <View testID="requests.root" style={[styles.root, { paddingTop: insets.top }]}>
        <ScreenStatusBar on="light" />
        <ScrollView contentContainerStyle={styles.page}>
          {title}
          {failure ? (
            // The list was empty when it last loaded; what is new since may be missing — said calmly.
            <Text testID="requests.reloadFailed" style={styles.line}>
              {refreshFailedLine(failure.code, true)}
            </Text>
          ) : null}
          <View style={styles.emptyState}>
            <EmptyState
              testID="requests.empty"
              illustration={emptyIllustration}
              illustrationRatio={ILLUSTRATION_RATIO}
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
      <View style={styles.listTop} />
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
              photo={cardPicture(null, photoFor(card.to), PICTURE_HEADERS)}
              fallback={CLUB_PICTURE}
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  page: { paddingHorizontal: tokens.space.gutter, paddingBottom: tokens.space.xl },
  // 09: the title 12 pt under the safe area, the line under it, the filters 24 pt lower.
  heading: { paddingTop: tokens.space.sm, gap: 2 },
  title: { ...rn(tokens.type.display), color: tokens.colors.textPrimary },
  subtitle: { ...rn(tokens.type.bodyLg), color: tokens.colors.textSecondary },
  filters: { marginTop: tokens.space.lg, marginHorizontal: -tokens.space.gutter },
  filtersContent: { paddingHorizontal: tokens.space.gutter, gap: tokens.space.xs },
  block: { marginTop: tokens.space.lg },
  listTop: { height: tokens.space.lg },
  cards: { gap: tokens.space.sm },
  separator: { height: tokens.space.sm },
  emptyState: { marginTop: tokens.space.lg },
  // A message is `text-secondary`, never `status-danger` (DESIGN.md: that is for a field at fault only).
  line: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary, marginTop: tokens.space.md },
  filterEmpty: {
    ...rn(tokens.type.bodyLg),
    color: tokens.colors.textSecondary,
    textAlign: "center",
    marginTop: tokens.space.xl,
  },
});
