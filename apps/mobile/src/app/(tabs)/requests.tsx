import NetInfo from "@react-native-community/netinfo";
import { useIsFocused, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RequestVM } from "@bbc/shared/api/v1/requests";
import { EmptyState, ErrorState, RequestCard, tokens, rn } from "@bbc/ui";

import { isOffline } from "@/features/explore/offline-logic";
import { queuedView, requestCard } from "@/features/requests/request-card";
import { listHints } from "@/features/requests/request-view-logic";
import { isOpen } from "@/features/requests/status";
import { askUnreadQuotes, noteUnreadQuotes } from "@/features/requests/unread-quotes-store";
import { fetchRequests, submitRequest } from "@/lib/api";
import { readFailureCopy, refreshFailedLine } from "@/lib/error-context";
import { flushQueue, listQueued, subscribeQueue, type QueuedRequest } from "@/lib/queue";

type ListItem = { kind: "server"; request: RequestVM } | { kind: "queued"; view: RequestVM; rejected: boolean };

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
  const queuedCount = useRef(queued.length);

  // The list follows the server: each time the tab comes into view (a request made from Explore, a state changed by
  // the specialist), and below when the phone comes back online. Only the first load shows the spinner; later ones keep
  // the list and its scroll where they are. Coming into view also sends what waits on the phone (one flush at a time,
  // lib/queue.ts).
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

  const server = items ?? [];
  const openServer = server.filter((r) => isOpen(r.status));
  const closed = server.filter((r) => !isOpen(r.status));
  const open: ListItem[] = [
    ...queued.map((q) => ({ kind: "queued" as const, view: queuedView(q), rejected: Boolean(q.rejectedAt) })),
    ...openServer.map((request) => ({ kind: "server" as const, request })),
  ];
  const empty = items !== null && open.length === 0 && closed.length === 0;
  // Figma 233:4639 / 240:5199: one line under the in-progress list — reassurance or a nudge.
  const hints = listHints(
    open.map((row) => ({
      status: row.kind === "queued" ? (row.rejected ? "rejected" : "queued") : row.request.status,
    })),
  );
  const openRequest = (id: string) => router.push({ pathname: "/request/[id]", params: { id } } as Href);

  if (loading && items === null && queued.length === 0) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={tokens.colors.primary} />
      </View>
    );
  }

  // Nothing to show and the server did not answer: say so, with a way to try again — a member with ten requests is
  // never told they have none (DESIGN.md: error and empty are separate frames).
  if (items === null && queued.length === 0 && failure) {
    return (
      <View testID="requests.root" style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <ErrorState
          testID="requests.error"
          variant="error"
          title={failure.title}
          body={failure.body}
          primary={{ label: "Try again", testID: "requests.error.retry", onPress: () => setReloadToken((n) => n + 1) }}
        />
      </View>
    );
  }

  const card = (r: RequestVM, testID: string, onPhone?: "queued" | "rejected") => {
    const c = requestCard(r, undefined, onPhone);
    return (
      <RequestCard
        key={r.id}
        testID={testID}
        title={c.title}
        facts={c.facts}
        when={c.when}
        badgeStatus={c.badge}
        accessibilityLabel={c.spoken}
        onPress={() => openRequest(r.id)}
      />
    );
  };

  return (
    <View testID="requests.root" style={[styles.root, { paddingTop: insets.top + tokens.space.md }]}>
      <Text style={styles.title} accessibilityRole="header">
        Your requests.
      </Text>
      <Text style={styles.intro}>Journeys in good hands.</Text>
      {hasMore ? (
        <Text testID="requests.hasMore" style={styles.hint}>
          Showing your 50 most recent
        </Text>
      ) : null}
      {/* The list stays; a reload that failed says so, calmly — what is shown may be out of date. With nothing loaded
          yet, the requests waiting on the phone stay on screen and the line says the rest did not load; Requests asks
          again each time it comes into view and when the phone is back online. */}
      {failure ? (
        <Text testID="requests.reloadFailed" style={styles.hint}>
          {refreshFailedLine(failure.code, items !== null)}
        </Text>
      ) : null}

      {empty ? (
        <EmptyState
          testID="requests.empty"
          title="No requests yet."
          body="Explore destinations and request a fare. Your requests will appear here."
          primary={{
            label: "Explore",
            onPress: () => router.push("/(tabs)/explore" as Href),
          }}
        />
      ) : (
        <FlatList
          data={[{ key: "open" }, { key: "closed" }]}
          keyExtractor={(i) => i.key}
          contentContainerStyle={{ paddingBottom: tokens.space.xxl }}
          renderItem={({ item }) => {
            if (item.key === "open") {
              if (open.length === 0) return null;
              return (
                <View>
                  <Text style={styles.section} accessibilityRole="header">
                    In progress
                  </Text>
                  <View style={styles.cards}>
                    {open.map((row) => {
                      const r = row.kind === "queued" ? row.view : row.request;
                      // Figma 240:5199: a request waiting on the phone says its details are saved; opening it offers
                      // `Send now`. One that will not go out by itself keeps its dates and its badge; opening it
                      // offers the call. Calls and retries live in the request, never on the card.
                      const onPhone = row.kind === "queued" ? (row.rejected ? "rejected" : "queued") : undefined;
                      return card(r, `requests.row.${r.id}`, onPhone);
                    })}
                  </View>
                  {hints.map((line, i) => (
                    <Text key={line} testID={`requests.hint.${i}`} style={styles.listHint}>
                      {line}
                    </Text>
                  ))}
                </View>
              );
            }
            if (closed.length === 0) return null;
            return (
              <View>
                <Text style={styles.section} accessibilityRole="header">
                  Completed
                </Text>
                <View style={styles.cards}>{closed.map((r) => card(r, `requests.row.${r.id}`))}</View>
              </View>
            );
          }}
        />
      )}
      <View testID="requests.empty.search" style={{ height: 0, width: 0 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage, paddingHorizontal: tokens.space.lg },
  centered: { alignItems: "center", justifyContent: "center" },
  title: { ...rn(tokens.type.display), color: tokens.colors.textPrimary },
  // Figma 233:4069: 24 pt between the title, the intro, a section's title and its cards; 12 pt between cards.
  intro: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary, marginTop: tokens.space.lg },
  section: {
    ...rn(tokens.type.title),
    color: tokens.colors.textPrimary,
    marginTop: tokens.space.lg,
    marginBottom: tokens.space.lg,
  },
  cards: { gap: tokens.space.sm },
  // A message is `text-secondary`, never `status-danger` (DESIGN.md: that is for a field at fault only).
  hint: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary, marginTop: tokens.space.sm },
  listHint: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary, marginTop: tokens.space.lg },
});
