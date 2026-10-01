import NetInfo from "@react-native-community/netinfo";
import { useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Linking, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RequestVM } from "@bbc/shared/api/v1/requests";
import { EmptyState, RequestRow, tokens, rn } from "@bbc/ui";

import { closedAt, requestView } from "@/features/requests/request-view-logic";
import { badgeStatus, isOpen, requestMeta } from "@/features/requests/status";
import { fetchRequests, submitRequest } from "@/lib/api";
import { env } from "@/lib/env";
import { flushQueue, listQueued, type QueuedRequest } from "@/lib/queue";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type ListItem =
  { kind: "server"; request: RequestVM } | { kind: "queued"; queued: QueuedRequest; route: string; meta: string };

function formatLegDates(legs: { date: string }[]): string {
  const fmt = (iso: string) => {
    const parts = iso.split("-").map(Number);
    const y = parts[0];
    const m = parts[1];
    const d = parts[2];
    if (!y || !m || !d) return iso;
    const month = MONTHS[m - 1];
    return month ? `${month} ${d}` : iso;
  };
  const first = legs[0];
  const last = legs[legs.length - 1];
  if (!first) return "";
  if (!last || legs.length === 1) return fmt(first.date);
  return `${fmt(first.date)}–${fmt(last.date)}`;
}

function queuedMeta(q: QueuedRequest): { route: string; meta: string } {
  const first = q.body.legs[0];
  const last = q.body.legs[q.body.legs.length - 1];
  const route = first && last ? `${first.from} → ${last.to}` : "";
  const cabin = q.body.cabin === "business" ? "Business" : "First";
  const adults = q.body.passengers.adult === 1 ? "1 adult" : `${q.body.passengers.adult} adults`;
  const price =
    q.body.priceAtRequest != null
      ? `from ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(q.body.priceAtRequest)}`
      : null;
  const meta = [formatLegDates(q.body.legs), cabin, adults, price].filter(Boolean).join(" · ");
  return { route, meta };
}

function openUrl(url: string) {
  void Linking.openURL(url);
}

export default function RequestsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<RequestVM[]>([]);
  const [queued, setQueued] = useState<QueuedRequest[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        await flushQueue((body, key) => submitRequest(body, key));
      } catch {
        // flushQueue isolates per item; this keeps fetchRequests running
      }
      const result = await fetchRequests();
      if (cancelled) return;
      setLoading(false);
      setQueued(listQueued());
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setItems(result.data.items);
      setHasMore(result.data.hasMore);
      setError(null);
    })().catch(() => {
      if (!cancelled) {
        setLoading(false);
        setError("Something went wrong.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        setReloadToken((n) => n + 1);
      }
    });
    return () => sub();
  }, []);

  const openServer = items.filter((r) => isOpen(r.status));
  const closed = items.filter((r) => !isOpen(r.status));
  const open: ListItem[] = [
    ...queued.map((q) => {
      const { route, meta } = queuedMeta(q);
      return { kind: "queued" as const, queued: q, route, meta };
    }),
    ...openServer.map((request) => ({ kind: "server" as const, request })),
  ];
  const empty = open.length === 0 && closed.length === 0;
  const supportPhone = env.EXPO_PUBLIC_SUPPORT_PHONE;

  if (loading) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={tokens.colors.primary} />
      </View>
    );
  }

  return (
    <View testID="requests.root" style={[styles.root, { paddingTop: insets.top + tokens.space.md }]}>
      <Text style={styles.title}>Your requests.</Text>
      <Text style={styles.intro}>Journeys in good hands.</Text>
      {hasMore ? (
        <Text testID="requests.hasMore" style={styles.hint}>
          Showing your 50 most recent
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {empty ? (
        <EmptyState
          testID="requests.empty"
          title="No requests yet."
          body="Search a route or pick an offer to get started."
          primary={{
            label: "Search",
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
                  <Text style={styles.section}>In progress</Text>
                  {open.map((row) => {
                    if (row.kind === "queued") {
                      const id = row.queued.id;
                      return (
                        <RequestRow
                          key={id}
                          testID={`requests.row.${id}`}
                          retryTestID={`requests.retry.${id}`}
                          route={row.route}
                          meta={row.meta}
                          badgeStatus="not_sent"
                          onPress={() => router.push({ pathname: "/request/[id]", params: { id } } as Href)}
                          onRetry={() => {
                            void (async () => {
                              try {
                                await flushQueue((body, key) => submitRequest(body, key), { only: id });
                              } catch {
                                // per-item isolation lives in flushQueue
                              }
                              setReloadToken((n) => n + 1);
                            })().catch(() => {
                              setReloadToken((n) => n + 1);
                            });
                          }}
                        />
                      );
                    }
                    const r = row.request;
                    return (
                      <RequestRow
                        key={r.id}
                        testID={`requests.row.${r.id}`}
                        callTestID={`requests.call.${r.id}`}
                        retryTestID={`requests.retry.${r.id}`}
                        route={r.route}
                        meta={requestMeta(r)}
                        badgeStatus={badgeStatus(r.status)}
                        onPress={() => router.push({ pathname: "/request/[id]", params: { id: r.id } } as Href)}
                        onCall={
                          r.status === "quoted" && supportPhone ? () => openUrl(`tel:${supportPhone}`) : undefined
                        }
                        onRetry={
                          r.status === "not_sent"
                            ? () => {
                                void (async () => {
                                  try {
                                    await flushQueue((body, key) => submitRequest(body, key));
                                  } catch {
                                    // per-item isolation lives in flushQueue
                                  }
                                  setReloadToken((n) => n + 1);
                                })().catch(() => {
                                  setReloadToken((n) => n + 1);
                                });
                              }
                            : undefined
                        }
                      />
                    );
                  })}
                </View>
              );
            }
            if (closed.length === 0) return null;
            return (
              <View>
                <Text style={styles.section}>Completed</Text>
                {closed.map((r) => {
                  const view = requestView(r.status, closedAt(r));
                  return (
                    <RequestRow
                      key={r.id}
                      testID={`requests.row.${r.id}`}
                      route={r.route}
                      meta={view.closedLine ?? requestMeta(r)}
                      badgeStatus={view.badge}
                      muted
                      onPress={() => router.push({ pathname: "/request/[id]", params: { id: r.id } } as Href)}
                    />
                  );
                })}
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
  intro: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  section: { ...rn(tokens.type.title), color: tokens.colors.textPrimary, marginTop: tokens.space.lg },
  hint: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary, marginBottom: tokens.space.sm },
  error: { ...rn(tokens.type.bodySm), color: tokens.colors.statusDanger },
});
