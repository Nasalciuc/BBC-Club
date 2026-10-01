import type { RequestVM } from "@bbc/shared/api/v1/requests";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BackButton, Button, ErrorState, StatusBadge, TabBar, Timeline, tokens, rn } from "@bbc/ui";

import { closedAt, requestView } from "@/features/requests/request-view-logic";
import { requestMeta } from "@/features/requests/status";
import { fetchRequest, submitRequest } from "@/lib/api";
import { stateCopy } from "@/lib/error-context";
import { env } from "@/lib/env";
import { getQueued, sendOne, type QueuedRequest } from "@/lib/queue";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function isQueuedId(id: string): boolean {
  return id.startsWith("q_");
}

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

function queuedToView(q: QueuedRequest): RequestVM {
  const first = q.body.legs[0];
  const last = q.body.legs[q.body.legs.length - 1];
  return {
    id: q.id,
    reference: "",
    route: first && last ? `${first.from} → ${last.to}` : "",
    dates: formatLegDates(q.body.legs),
    cabin: q.body.cabin,
    passengers: q.body.passengers,
    priceAtRequest: q.body.priceAtRequest ?? null,
    status: "not_sent",
    createdAt: q.enqueuedAt,
    timeline: [],
  };
}

function dialSupport() {
  const phone = env.EXPO_PUBLIC_SUPPORT_PHONE;
  if (!phone) return;
  void Linking.openURL(`tel:${phone}`);
}

export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [vm, setVm] = useState<RequestVM | null>(null);
  const [queued, setQueued] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!id || typeof id !== "string") {
      setError("This request could not be found.");
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
          setError("This request is no longer in your queue.");
          setVm(null);
          setQueued(false);
          setLoading(false);
          return;
        }
        setVm(queuedToView(item));
        setQueued(true);
        setError(null);
        setLoading(false);
        return;
      }

      const result = await fetchRequest(id);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        setVm(null);
        setQueued(false);
        setLoading(false);
        return;
      }
      setVm(result.data);
      setQueued(false);
      setError(null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id, reloadToken]);

  async function onSendNow() {
    if (!id || typeof id !== "string") return;
    setSending(true);
    try {
      const result = await sendOne(id, (body, key) => submitRequest(body, key));
      if (result.sent > 0) {
        router.replace("/(tabs)/requests" as Href);
        return;
      }
      setReloadToken((n) => n + 1);
    } finally {
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

  if (error || !vm) {
    const copy = stateCopy("route");
    return (
      <View testID="request.root" style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <ErrorState
          testID="request.error"
          variant="error"
          title={copy.title}
          body={error ?? copy.body}
          primary={{ label: "Back", onPress: () => router.back() }}
        />
      </View>
    );
  }

  const supportPhone = env.EXPO_PUBLIC_SUPPORT_PHONE;
  const showCall = vm.status === "quoted" && Boolean(supportPhone);
  const showSend = queued;
  const view = requestView(queued ? "queued" : vm.status, closedAt(vm));

  return (
    <View testID="request.root" style={styles.root}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + tokens.space.md,
          paddingHorizontal: tokens.space.lg,
          paddingBottom: insets.bottom + tokens.space.xxl,
        }}
      >
        <BackButton testID="request.back" onPress={() => router.back()} style={styles.back} />

        <View style={styles.header}>
          <Text style={styles.route}>{vm.route}</Text>
          {view.badge ? <StatusBadge status={view.badge} /> : null}
        </View>
        <Text style={styles.meta}>{requestMeta(vm)}</Text>
        {view.closedLine ? (
          <Text testID="request.closed" style={styles.closed}>
            {view.closedLine}
          </Text>
        ) : null}
        {view.sentence ? (
          <Text testID="request.sentence" style={styles.sentence}>
            {view.sentence}
          </Text>
        ) : null}

        {vm.reference.trim().length > 0 ? (
          <Text testID="request.reference" style={styles.reference}>
            Ref {vm.reference}
          </Text>
        ) : null}

        {view.showTimeline ? (
          <>
            <Text style={styles.section}>Status</Text>
            <Timeline
              testID="request.timeline"
              status={view.timelineStatus}
              events={vm.timeline}
              currentCaption={view.caption}
            />
          </>
        ) : null}

        {showCall ? (
          <Button
            testID="request.call"
            label="Call your specialist"
            shape="pill"
            variant="primary"
            onPress={dialSupport}
            style={styles.cta}
          />
        ) : null}

        {showSend ? (
          <Button
            testID="request.send"
            label="Send now"
            shape="pill"
            variant="primary"
            busy={sending}
            onPress={() => {
              void onSendNow().catch(() => {
                setSending(false);
                setReloadToken((n) => n + 1);
              });
            }}
            style={styles.cta}
          />
        ) : null}
      </ScrollView>
      <View style={{ paddingBottom: insets.bottom }}>
        <TabBar
          testID="tabs.bar"
          active="requests"
          unread={0}
          onPress={(key) =>
            router.push(
              (key === "requests"
                ? "/(tabs)/requests"
                : key === "profile"
                  ? "/(tabs)/profile"
                  : "/(tabs)/explore") as Href,
            )
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  centered: { alignItems: "center", justifyContent: "center", padding: tokens.space.lg },
  back: { marginBottom: tokens.space.md },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.space.sm,
    marginBottom: tokens.space.xs,
  },
  route: { ...rn(tokens.type.display), color: tokens.colors.textPrimary, flex: 1 },
  meta: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary, marginBottom: tokens.space.md },
  closed: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary, marginBottom: tokens.space.sm },
  sentence: { ...rn(tokens.type.body), color: tokens.colors.textPrimary, marginBottom: tokens.space.md },
  reference: { ...rn(tokens.type.labelMono), color: tokens.colors.textSecondary, marginBottom: tokens.space.md },
  section: {
    ...rn(tokens.type.titleSm),
    color: tokens.colors.textPrimary,
    marginBottom: tokens.space.sm,
    marginTop: tokens.space.sm,
  },
  cta: { marginTop: tokens.space.xl },
});
