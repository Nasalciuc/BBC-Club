import type { FareVM } from "@bbc/shared/api/v1/fares";
import type { ProposalDetailVM } from "@bbc/shared/api/v1/proposals";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BackButton, Button, ErrorState, ListRow, PricePair, StateMessage, TabBar, tokens, rn } from "@bbc/ui";

import { RequestSheet, type RequestSheetHandle } from "@/components/RequestSheet";
import { fetchFare, fetchProfile, fetchProposal, type FareGoneContext, type Profile } from "@/lib/api";
import { env } from "@/lib/env";
import { stateCopy } from "@/lib/error-context";
import { formatPrice } from "@/lib/format";

/** Frame photo band. No space token equals 340; bottom corners follow DESIGN.md (12), not the square frame. */
const HERO_BAND = 340;

function durationLabel(minutes: number): string {
  return `${Math.floor(minutes / 60)}H ${String(minutes % 60).padStart(2, "0")}M`;
}

function placeLine(code: string, city: string): string {
  return `${code} · ${city.toUpperCase()}`;
}

function clock(local: string | null, offset: number, code: string): string {
  if (!local) return code;
  return offset > 0 ? `${local} +${offset}` : local;
}

function dialSupport() {
  const phone = env.EXPO_PUBLIC_SUPPORT_PHONE;
  if (!phone) return;
  void Linking.openURL(`tel:${phone}`);
}

export default function FareDetailScreen() {
  const { id, offerId: offerIdParam } = useLocalSearchParams<{ id: string; offerId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<RequestSheetHandle>(null);
  const [fare, setFare] = useState<FareVM | null>(null);
  const [offer, setOffer] = useState<ProposalDetailVM | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [gone, setGone] = useState<FareGoneContext | true | null>(null);
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
        if (fareResult.status === 410) {
          setGone(fareResult.gone ?? true);
        } else {
          setError(fareResult.message);
        }
        setLoading(false);
        return;
      }
      setFare(fareResult.data);
      const resolvedOfferId =
        (typeof offerIdParam === "string" && offerIdParam.length > 0 ? offerIdParam : null) ?? fareResult.data.offerId;
      if (resolvedOfferId) {
        const offerResult = await fetchProposal(resolvedOfferId);
        if (offerResult.ok) setOffer(offerResult.data);
      }
      setLoading(false);
    })();
  }, [id, offerIdParam]);

  if (loading) {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator color={tokens.colors.primary} />
      </View>
    );
  }

  if (gone) {
    const closed = gone === true ? null : gone;
    const copy = stateCopy("gone");
    return (
      <View testID="fare.root" style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.goneNav}>
          <BackButton testID="fare.back" onPress={() => router.back()} />
        </View>
        <View style={styles.goneBody}>
          <StateMessage
            testID="fare.gone"
            variant="gone"
            title={copy.title}
            body={copy.body}
            primary={{
              label: "Request an alternative",
              testID: "fare.alternative",
              onPress: () =>
                sheetRef.current?.present({
                  profile,
                  mode: "alternative",
                  replacesFareId: typeof id === "string" ? id : undefined,
                  fromCode: closed?.from,
                  toCode: closed?.to,
                  city: closed?.to,
                }),
            }}
          />
          <Text style={styles.caption}>A specialist will call you shortly.</Text>
        </View>
        <View style={{ paddingBottom: insets.bottom }}>
          <TabBar
            testID="tabs.bar"
            active="explore"
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
        <RequestSheet ref={sheetRef} />
      </View>
    );
  }

  if (error || !fare) {
    const copy = stateCopy("route");
    return (
      <View testID="fare.root" style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <ErrorState
          testID="fare.error"
          variant="error"
          title={copy.title}
          body={error ?? copy.body}
          primary={{ label: "Try again", onPress: () => router.back() }}
        />
      </View>
    );
  }

  const savings = fare.price.published != null ? Math.round(fare.price.published - fare.price.offer) : null;
  const media = offer?.mediaUrl ?? null;
  const cabinWord = fare.product ?? (fare.cabin === "first" ? "First" : "Business");
  const carrierLine = `${fare.carrier.name} · ${cabinWord} · ${fare.nonstop ? "Nonstop" : "One stop"}`;
  const datePart = fare.departAt
    ? new Date(fare.departAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()
    : null;
  const factsLine = [datePart, fare.durationMinutes != null ? durationLabel(fare.durationMinutes) : null]
    .filter(Boolean)
    .join(" · ");
  const supportPhone = env.EXPO_PUBLIC_SUPPORT_PHONE;
  const openTab = (key: "explore" | "requests" | "profile") => {
    router.push(
      (key === "requests" ? "/(tabs)/requests" : key === "profile" ? "/(tabs)/profile" : "/(tabs)/explore") as Href,
    );
  };

  return (
    <View testID="fare.root" style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {media ? (
          <View style={styles.hero}>
            <Image
              source={{ uri: media }}
              style={StyleSheet.absoluteFill}
              accessibilityIgnoresInvertColors
              testID="fare.media"
            />
            <LinearGradient
              colors={["transparent", tokens.colors.scrim]}
              locations={[0.55, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={[styles.heroTop, { paddingTop: insets.top }]}>
              <BackButton testID="fare.back" onPress={() => router.back()} style={styles.backPlate} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.displayOnDark}>{fare.from.city}</Text>
              <Text style={styles.displayOnDark}>{`to ${fare.to.city}`}</Text>
              <Text style={styles.factsOnDark}>{fare.cabin === "first" ? "FIRST CLASS" : "BUSINESS CLASS"}</Text>
            </View>
          </View>
        ) : (
          <View style={[styles.plain, { paddingTop: insets.top + tokens.space.md }]}>
            <BackButton testID="fare.back" onPress={() => router.back()} style={styles.back} />
            <Text style={styles.display}>{fare.from.city}</Text>
            <Text style={styles.display}>{`to ${fare.to.city}`}</Text>
          </View>
        )}

        <View style={styles.details}>
          <Text style={styles.carrier}>{carrierLine}</Text>
          <View style={styles.timeBlock}>
            <View style={styles.timeCol}>
              <Text style={styles.factsMono}>{placeLine(fare.from.code, fare.from.city)}</Text>
              <Text style={styles.timeDisplay}>{clock(fare.departLocal, 0, fare.from.code)}</Text>
            </View>
            <View style={styles.timeCol}>
              <Text style={styles.factsMono}>{placeLine(fare.to.code, fare.to.city)}</Text>
              <Text style={styles.timeDisplay}>{clock(fare.arriveLocal, fare.arriveDayOffset, fare.to.code)}</Text>
            </View>
          </View>
          {factsLine ? <Text style={styles.factsMono}>{factsLine}</Text> : null}
          {media ? null : <Text style={styles.editorial}>{"Your next journey,\nthoughtfully arranged."}</Text>}
          <PricePair price={fare.price} layout="editorial" />
          {savings != null && savings > 0 ? (
            <ListRow
              testID="fare.whyLower"
              label={`Why it’s $${savings.toLocaleString("en-US")} lower`}
              onPress={() => setWhyOpen(true)}
            />
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          testID="fare.request"
          label="Request this fare"
          shape="pill"
          onPress={() => sheetRef.current?.present({ fare, profile })}
        />
        <Text style={styles.caption}>
          {media ? "A specialist arranges everything by phone." : "No payment is taken in the app."}
        </Text>
        {supportPhone ? (
          <Pressable
            testID="fare.callSpecialist"
            accessibilityRole="button"
            accessibilityLabel="Call a specialist"
            onPress={dialSupport}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Text style={styles.caption}>Call a specialist</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={{ paddingBottom: insets.bottom }}>
        <TabBar testID="tabs.bar" active="explore" unread={0} onPress={openTab} />
      </View>

      <Modal visible={whyOpen} transparent animationType="fade" onRequestClose={() => setWhyOpen(false)}>
        <Pressable testID="fare.whyScrim" style={styles.modalScrim} onPress={() => setWhyOpen(false)}>
          <View style={styles.modalCard} testID="fare.whySheet">
            <StateMessage
              testID="fare.whyMessage"
              variant="error"
              title={`Why it’s ${formatPrice(savings ?? 0, fare.price.currency)} lower`}
              body={`${formatPrice(fare.price.published!, fare.price.currency)} published − ${formatPrice(fare.price.offer, fare.price.currency)} club fare = ${formatPrice(savings ?? 0, fare.price.currency)}.`}
              primary={{ label: "Got it", testID: "fare.whyClose", onPress: () => setWhyOpen(false) }}
            />
          </View>
        </Pressable>
      </Modal>

      <RequestSheet ref={sheetRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  centered: { alignItems: "center", justifyContent: "center", padding: tokens.space.lg },
  goneNav: { paddingHorizontal: tokens.space.lg, paddingBottom: tokens.space.md },
  goneBody: { flex: 1, justifyContent: "center", gap: tokens.space.sm },
  scroll: { paddingBottom: tokens.space.lg },
  back: { marginBottom: tokens.space.xl },
  backPlate: {
    backgroundColor: tokens.colors.surfaceCard,
    borderRadius: tokens.radius.pill,
  },
  hero: {
    height: HERO_BAND,
    justifyContent: "space-between",
    backgroundColor: tokens.colors.surfaceMuted,
    borderBottomLeftRadius: tokens.radius.card,
    borderBottomRightRadius: tokens.radius.card,
    overflow: "hidden",
  },
  heroTop: { paddingHorizontal: tokens.space.lg },
  heroCopy: { paddingHorizontal: tokens.space.lg, paddingBottom: tokens.space.lg, gap: tokens.space.xs },
  plain: { paddingHorizontal: tokens.space.lg },
  display: { ...rn(tokens.type.display), color: tokens.colors.textPrimary },
  displayOnDark: { ...rn(tokens.type.display), color: tokens.colors.textOnDark },
  factsOnDark: { ...rn(tokens.type.factsMono), color: tokens.colors.textOnDark, marginTop: tokens.space.xs },
  details: { paddingHorizontal: tokens.space.lg, paddingTop: tokens.space.lg, gap: tokens.space.lg },
  carrier: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  timeBlock: { flexDirection: "row", gap: tokens.space.lg },
  timeCol: { flex: 1, gap: tokens.space.xxs },
  timeDisplay: { ...rn(tokens.type.display), color: tokens.colors.textPrimary },
  factsMono: { ...rn(tokens.type.factsMono), color: tokens.colors.textSecondary },
  editorial: { ...rn(tokens.type.title), color: tokens.colors.textPrimary },
  footer: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.sm,
    gap: tokens.space.xs,
    backgroundColor: tokens.colors.surfacePage,
  },
  caption: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary },
  body: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
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
