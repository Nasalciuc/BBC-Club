import { fixture } from "@bbc/shared/fixture";
import type { FareVM } from "@bbc/shared/api/v1/fares";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, ErrorState, Icon, ListRow, PricePair, SectionLabel, tokens, rn } from "@bbc/ui";

import { RequestSheet, type RequestSheetHandle } from "@/components/RequestSheet";
import { fetchFare, fetchProfile, type Profile } from "@/lib/api";
import { formatPrice, formatValidUntil } from "@/lib/format";

const SUPPORT = "+18000000000";
const CTA_RESERVE = 56 + 24 + 18;

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function TimeBlock({ fare }: { fare: FareVM }) {
  if (!fare.departAt || !fare.arriveAt) {
    return <Text style={styles.factsMono}>{fare.nonstop ? "NONSTOP" : "1 STOP"} · TIMES ON REQUEST</Text>;
  }
  const dur =
    fare.durationMinutes != null
      ? `${Math.floor(fare.durationMinutes / 60)}H ${String(fare.durationMinutes % 60).padStart(2, "0")}`
      : null;
  return (
    <View style={styles.timeBlock}>
      <View style={styles.timeCol}>
        <Text style={styles.timeDisplay}>{hhmm(fare.departAt)}</Text>
        <Text style={styles.factsMono}>{fare.from.code}</Text>
        <Text style={styles.caption}>
          {new Date(fare.departAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </Text>
      </View>
      <View style={styles.timeMid}>
        <View style={styles.hairline} />
        {dur ? <Text style={styles.dur}>{dur}</Text> : null}
      </View>
      <View style={[styles.timeCol, styles.timeRight]}>
        <Text style={styles.timeDisplay}>{hhmm(fare.arriveAt)}</Text>
        <Text style={styles.factsMono}>{fare.to.code}</Text>
        <Text style={styles.caption}>
          {new Date(fare.arriveAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </Text>
      </View>
    </View>
  );
}

export default function FareDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<RequestSheetHandle>(null);
  const [fare, setFare] = useState<FareVM | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);

  useEffect(() => {
    if (!id || typeof id !== "string") {
      setError("This fare is unavailable.");
      setLoading(false);
      return;
    }
    void (async () => {
      const [fareResult, profileResult] = await Promise.all([fetchFare(id), fetchProfile()]);
      if (profileResult.ok) setProfile(profileResult.data);
      if (!fareResult.ok) {
        if (fareResult.status === 410) setGone(true);
        else setError(fareResult.message);
        setLoading(false);
        return;
      }
      setFare(fareResult.data);
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator color={tokens.colors.primary} />
      </View>
    );
  }

  if (gone) {
    const closed = fixture.fares.find((f) => f.id === id);
    return (
      <View testID="fare.root" style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <ErrorState
          testID="fare.gone"
          variant="gone"
          title="This fare has closed."
          body={
            closed
              ? `Was ${formatPrice(closed.price.offer, closed.price.currency)} · valid until ${new Date(closed.validUntil).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
              : "The price you saw is no longer available."
          }
          primary={{
            label: closed ? `Request ${closed.from.code} → ${closed.to.code}` : "Request this route",
            onPress: () =>
              sheetRef.current?.present({
                profile,
                fromCode: closed?.from.code,
                toCode: closed?.to.code,
              }),
          }}
          secondary={{
            label: "See other fares",
            onPress: () => router.replace("/(tabs)/explore" as Href),
          }}
        />
        <RequestSheet ref={sheetRef} onSeeRequests={() => router.push("/(tabs)/requests" as Href)} />
      </View>
    );
  }

  if (error || !fare) {
    return (
      <View testID="fare.root" style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <ErrorState
          testID="fare.error"
          variant="error"
          title="Something went wrong."
          body={error ?? "This fare could not be found."}
          primary={{ label: "Try again", onPress: () => router.back() }}
        />
      </View>
    );
  }

  const savings = fare.price.published != null ? Math.round(fare.price.published - fare.price.offer) : null;
  const offerFacts = fixture.offers.find((o) => o.to === fare.to.code);
  const flightNumber = offerFacts?.facts && "flightNumber" in offerFacts.facts ? offerFacts.facts.flightNumber : null;
  const included = [
    fare.nonstop ? "Nonstop" : "One stop",
    fare.product ?? (fare.cabin === "business" ? "Business class" : "First class"),
    "Lounge access",
  ];
  const factsLine = [
    fare.nonstop ? "NONSTOP" : "1 STOP",
    fare.product?.toUpperCase(),
    offerFacts?.facts && "carrier" in offerFacts.facts ? undefined : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View testID="fare.root" style={styles.root}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + tokens.space.md,
          paddingHorizontal: tokens.space.lg,
          paddingBottom: insets.bottom + CTA_RESERVE + tokens.space.xl,
        }}
      >
        <Pressable
          testID="fare.back"
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
          onPress={() => router.back()}
          style={styles.back}
        >
          <Icon name="chevron" size={20} color={tokens.colors.textPrimary} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <Text style={styles.display}>
          {fare.from.city} → {fare.to.city}
        </Text>

        <View style={styles.carrierRow}>
          <View style={styles.logo}>
            <Text style={styles.logoCode}>{fare.carrier.code ?? "··"}</Text>
          </View>
          <Text style={styles.carrierName}>{fare.carrier.name}</Text>
          {flightNumber ? <Text style={styles.factsMono}>{flightNumber}</Text> : null}
        </View>

        <TimeBlock fare={fare} />
        {factsLine ? <Text style={styles.factsMono}>{factsLine}</Text> : null}

        <SectionLabel label="What's included" />
        {included.map((line) => (
          <View key={line} style={styles.checkRow}>
            <Icon name="check" size={16} color={tokens.colors.textPrimary} />
            <Text style={styles.body}>{line}</Text>
          </View>
        ))}

        <View style={styles.priceBlock}>
          <PricePair price={fare.price} size="lg" align="left" />
        </View>

        {savings != null && savings > 0 ? (
          <ListRow
            testID="fare.whyLower"
            label={`Why it's $${savings.toLocaleString("en-US")} lower`}
            onPress={() => setWhyOpen(true)}
          />
        ) : null}

        <Text style={styles.caption}>{formatValidUntil(fare.validUntil)} · a specialist books it for you</Text>
        <Pressable
          testID="fare.callSpecialist"
          accessibilityRole="button"
          accessibilityLabel={`Call specialist ${fixture.advisor.name}`}
          onPress={() => void Linking.openURL(`tel:${SUPPORT}`)}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={styles.caption}>Your specialist · {fixture.advisor.name} · Call</Text>
        </Pressable>
      </ScrollView>

      <View style={[styles.sticky, { paddingBottom: insets.bottom + tokens.space.sm }]}>
        <Button
          testID="fare.request"
          label="Request this fare"
          shape="card"
          onPress={() => sheetRef.current?.present({ fare, profile })}
        />
      </View>

      <Modal visible={whyOpen} transparent animationType="fade" onRequestClose={() => setWhyOpen(false)}>
        <Pressable testID="fare.whyScrim" style={styles.modalScrim} onPress={() => setWhyOpen(false)}>
          <View style={styles.modalCard} testID="fare.whySheet">
            <Text style={styles.title}>Why it's lower</Text>
            <Text style={styles.body}>
              Published fares are what the airline lists. We find inventory and consolidator rates that specialists can
              ticket for you — often 30–50% under that published number. The source on the struck price is the FTC
              reference for what you would have paid.
            </Text>
            <Button testID="fare.whyClose" label="Got it" shape="card" onPress={() => setWhyOpen(false)} />
          </View>
        </Pressable>
      </Modal>

      <RequestSheet ref={sheetRef} onSeeRequests={() => router.push("/(tabs)/requests" as Href)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  centered: { alignItems: "center", justifyContent: "center", padding: tokens.space.lg },
  back: { flexDirection: "row", alignItems: "center", gap: tokens.space.xxs, marginBottom: tokens.space.md },
  backText: { ...rn(tokens.type.bodySm), color: tokens.colors.textPrimary },
  display: { ...rn(tokens.type.display), color: tokens.colors.textPrimary, marginBottom: tokens.space.md },
  carrierRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginBottom: tokens.space.md },
  logo: {
    width: 20,
    height: 20,
    borderRadius: tokens.radius.badge,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  logoCode: { ...rn(tokens.type.labelMono), color: tokens.colors.textPrimary },
  carrierName: { ...rn(tokens.type.titleSm), color: tokens.colors.textPrimary, flex: 1 },
  timeBlock: { flexDirection: "row", alignItems: "center", marginBottom: tokens.space.md },
  timeCol: { gap: tokens.space.xxs },
  timeRight: { alignItems: "flex-end" },
  timeDisplay: { ...rn(tokens.type.display), color: tokens.colors.textPrimary },
  timeMid: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: tokens.space.sm },
  hairline: { height: 1, alignSelf: "stretch", backgroundColor: tokens.colors.borderDefault },
  dur: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary, marginTop: -tokens.space.sm },
  factsMono: { ...rn(tokens.type.factsMono), color: tokens.colors.textSecondary, marginBottom: tokens.space.sm },
  caption: { ...rn(tokens.type.caption), color: tokens.colors.textTertiary, marginTop: tokens.space.sm },
  checkRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginBottom: tokens.space.xs },
  body: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
  priceBlock: { marginVertical: tokens.space.lg },
  sticky: {
    position: "absolute",
    left: tokens.space.lg,
    right: tokens.space.lg,
    bottom: 0,
    backgroundColor: tokens.colors.surfacePage,
    paddingTop: tokens.space.sm,
  },
  pressed: { opacity: 0.7 },
  modalScrim: {
    flex: 1,
    backgroundColor: tokens.colors.scrim,
    justifyContent: "flex-end",
    padding: tokens.space.lg,
  },
  modalCard: {
    backgroundColor: tokens.colors.surfaceCard,
    borderRadius: tokens.radius.panel,
    padding: tokens.space.lg,
    gap: tokens.space.md,
  },
  title: { ...rn(tokens.type.title), color: tokens.colors.textPrimary },
});
