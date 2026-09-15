import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ProposalDetailVM } from "@bbc/shared/api/v1/proposals";

import { ClubButton } from "@/components/club-button";
import { ClubIcon } from "@/components/club-icon";
import { Club } from "@/constants/club";
import { fetchProposal, respondToProposal } from "@/lib/api";
import { factsLine, formatPrice, formatValidUntil, routeLine } from "@/lib/format";

export default function ProposalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [detail, setDetail] = useState<ProposalDetailVM | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id || typeof id !== "string") {
      setError("This offer is unavailable.");
      setLoading(false);
      return;
    }
    void (async () => {
      const result = await fetchProposal(id);
      if (!result.ok) {
        if (result.status === 410 || result.code === "GONE") setGone(true);
        else setError(result.message);
        setLoading(false);
        return;
      }
      setDetail(result.data);
      if (result.data.state === "interested") {
        setDoneMessage("Julia will call you shortly.");
      } else if (result.data.state === "dismissed") {
        setDoneMessage("Offer dismissed.");
      }
      setLoading(false);
    })();
  }, [id]);

  async function onRespond(response: "interested" | "dismissed") {
    if (!id || typeof id !== "string" || busy) return;
    setBusy(true);
    const result = await respondToProposal(id, response);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDetail((prev) => (prev ? { ...prev, state: result.data.state } : prev));
    setDoneMessage(response === "interested" ? "Julia will call you shortly." : "Offer dismissed.");
  }

  if (loading) {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator color={Club.colors.primary} testID="detail.loading" />
      </View>
    );
  }

  if (gone) {
    return (
      <View testID="detail.expired" style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.goneTitle}>This offer has expired</Text>
        <Text style={styles.goneBody}>Ask Julia for something new — she is always looking.</Text>
        <Pressable testID="detail.back" accessibilityRole="button" onPress={() => router.back()}>
          <Text style={styles.link}>Back to proposals</Text>
        </Pressable>
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View testID="detail.error" style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.goneTitle}>Offer unavailable</Text>
        <Text style={styles.goneBody}>{error ?? "This proposal could not be found."}</Text>
        <Pressable testID="detail.back" accessibilityRole="button" onPress={() => router.back()}>
          <Text style={styles.link}>Back to proposals</Text>
        </Pressable>
      </View>
    );
  }

  const facts = factsLine(detail.flightFacts);
  const responded = detail.state !== "unseen" || doneMessage != null;

  return (
    <View testID="detail.root" style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + Club.space.xxl }}>
        <View style={styles.hero}>
          {detail.mediaUrl ? (
            <Image
              source={{ uri: detail.mediaUrl }}
              style={styles.heroImage}
              contentFit="cover"
              placeholder={detail.mediaBlurhash ? { blurhash: detail.mediaBlurhash } : undefined}
            />
          ) : (
            <View style={[styles.heroImage, styles.placeholder]} />
          )}
          <LinearGradient colors={[...Club.colors.scrim]} style={styles.scrim} />
          <Pressable
            testID="detail.back"
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            style={[styles.back, { top: insets.top + Club.space.sm }]}
          >
            <ClubIcon name="back" size={22} color={Club.colors.textOnDark} />
          </Pressable>
        </View>

        <View style={styles.body}>
          <Text style={styles.title}>{detail.title}</Text>
          {detail.contextLine ? <Text style={styles.context}>{detail.contextLine}</Text> : null}
          <Text style={styles.facts}>{routeLine(detail)}</Text>
          {facts ? <Text style={styles.facts}>{facts}</Text> : null}
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatPrice(detail.price.offer, detail.price.currency)}</Text>
            {detail.price.published != null ? (
              <Text style={styles.published}>{formatPrice(detail.price.published, detail.price.currency)}</Text>
            ) : null}
          </View>
          <Text style={styles.valid}>{formatValidUntil(detail.validUntil)}</Text>
          {detail.body ? <Text style={styles.copy}>{detail.body}</Text> : null}
          <Text style={styles.advisor}>Curated by {detail.advisorName.split(" ")[0]}.</Text>

          {responded && doneMessage ? (
            <Text testID="detail.done" style={styles.done}>
              {doneMessage}
            </Text>
          ) : (
            <View style={styles.actions}>
              <ClubButton
                testID="detail.interested"
                label="I'm interested"
                variant="primary"
                arrow
                disabled={busy}
                onPress={() => void onRespond("interested")}
              />
              <Pressable
                testID="detail.dismiss"
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void onRespond("dismissed")}
                style={styles.dismissHit}
              >
                <Text style={styles.dismiss}>Not now</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Club.colors.surfacePage,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Club.space.gutter,
    gap: Club.space.sm,
  },
  hero: {
    width: "100%",
    height: 320,
    backgroundColor: Club.colors.surfaceMuted,
    borderBottomLeftRadius: Club.radius.card,
    borderBottomRightRadius: Club.radius.card,
    overflow: "hidden",
  },
  heroImage: {
    ...StyleSheet.absoluteFill,
  },
  placeholder: {
    backgroundColor: Club.colors.surfaceMuted,
  },
  scrim: {
    ...StyleSheet.absoluteFill,
  },
  back: {
    position: "absolute",
    left: Club.space.md,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    paddingHorizontal: Club.space.gutter,
    paddingTop: Club.space.lg,
    gap: Club.space.xs,
  },
  title: {
    ...Club.type.headline,
    color: Club.colors.textPrimary,
  },
  context: {
    ...Club.type.bodySm,
    color: Club.colors.textSecondary,
  },
  facts: {
    ...Club.type.factsMono,
    color: Club.colors.textSecondary,
    textTransform: "uppercase",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: Club.space.xs,
    marginTop: Club.space.sm,
  },
  price: {
    ...Club.type.title,
    color: Club.colors.textPrimary,
  },
  published: {
    ...Club.type.caption,
    color: Club.colors.textTertiary,
    textDecorationLine: "line-through",
  },
  valid: {
    ...Club.type.caption,
    color: Club.colors.textTertiary,
  },
  copy: {
    ...Club.type.body,
    color: Club.colors.textPrimary,
    marginTop: Club.space.md,
  },
  advisor: {
    ...Club.type.bodySm,
    color: Club.colors.textSecondary,
    marginTop: Club.space.sm,
  },
  actions: {
    marginTop: Club.space.xl,
    gap: Club.space.md,
  },
  dismissHit: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  dismiss: {
    ...Club.type.body,
    color: Club.colors.textSecondary,
  },
  done: {
    ...Club.type.titleSm,
    color: Club.colors.textPrimary,
    marginTop: Club.space.xl,
  },
  goneTitle: {
    ...Club.type.title,
    color: Club.colors.textPrimary,
    textAlign: "center",
  },
  goneBody: {
    ...Club.type.bodySm,
    color: Club.colors.textSecondary,
    textAlign: "center",
  },
  link: {
    ...Club.type.button,
    color: Club.colors.primary,
    marginTop: Club.space.md,
  },
});
