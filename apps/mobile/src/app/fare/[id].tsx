import type { FareVM } from "@bbc/shared/api/v1/fares";
import type { ProposalDetailVM } from "@bbc/shared/api/v1/proposals";
import { useLocalSearchParams, useRouter } from "expo-router";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BackButton,
  Button,
  ErrorState,
  ListRow,
  ModalSheet,
  type ModalSheetHandle,
  Photo,
  PhotoCredit,
  PricePair,
  SectionLabel,
  StateMessage,
  tokens,
  rn,
} from "@bbc/ui";

import { RequestSheet, type RequestSheetHandle } from "@/components/RequestSheet";
import { RootTabBar } from "@/components/RootTabBar";
import { ScreenStatusBar } from "@/components/screen-status-bar";
import {
  aboutFareNote,
  carrierLine,
  closedFareLines,
  comparisonLine,
  factsLine,
  savings as savingsOf,
} from "@/features/fares/fare-page-logic";
import { bandPicture } from "@/features/places/place-photo-logic";
import { CLUB_PICTURE, PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";
import { fetchFare, fetchProfile, fetchProposal, type FareGoneContext, type Profile } from "@/lib/api";
import { env } from "@/lib/env";
import { readFailureCopy, stateCopy } from "@/lib/error-context";
import { formatPrice } from "@/lib/format";

/** Figma 135:846: the offer's photo band, 340 pt, square at the bottom. No space token equals 340. */
const HERO_BAND = 340;

function placeLine(code: string, city: string): string {
  return `${code} · ${city.toUpperCase()}`;
}

function clock(local: string | null, offset: number, code: string): string {
  if (!local) return code;
  return offset > 0 ? `${local} +${offset}` : local;
}

export default function FareDetailScreen() {
  const { id, offerId: offerIdParam } = useLocalSearchParams<{ id: string; offerId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<RequestSheetHandle>(null);
  const aboutRef = useRef<ModalSheetHandle>(null);
  const [fare, setFare] = useState<FareVM | null>(null);
  const [offer, setOffer] = useState<ProposalDetailVM | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [gone, setGone] = useState<FareGoneContext | true | null>(null);
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  // `Try again` loads the fare again, here — it never leaves the page (ADR-IMPL-047).
  const [reloadToken, setReloadToken] = useState(0);
  // An offer's photo band carries the status bar until the page scrolls it away; the porcelain under it then needs
  // the dark glyphs.
  const [pastBand, setPastBand] = useState(false);
  const { width } = useWindowDimensions();
  // ADR-IMPL-043: only an offer's page has a photo band, so only it asks for the city's photo.
  const photoFor = usePlacePhotos(offer ? [fare?.to.code] : []);

  useEffect(() => {
    if (!id || typeof id !== "string") {
      setError({ title: stateCopy("route").title, body: "This fare is unavailable." });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    void (async () => {
      const [fareResult, profileResult] = await Promise.all([fetchFare(id), fetchProfile()]);
      if (profileResult.ok) setProfile(profileResult.data);
      if (!fareResult.ok) {
        if (fareResult.status === 410) {
          setGone(fareResult.gone ?? true);
        } else {
          setError(readFailureCopy(fareResult.code, "fare"));
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
  }, [id, offerIdParam, reloadToken]);

  // While it loads, and when it did not, the page keeps its way back and the tab bar (ADR-IMPL-047).
  if (loading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <ScreenStatusBar on="light" />
        <View style={styles.goneNav}>
          <BackButton testID="fare.back" onPress={() => router.back()} />
        </View>
        <View style={[styles.waiting, styles.centered]}>
          <ActivityIndicator color={tokens.colors.primary} />
        </View>
        <RootTabBar active="explore" />
      </View>
    );
  }

  if (gone) {
    // Figma 135:848: `Flight details` beside the back button; what closed — its day, its route, its airline; the
    // message; the way on pinned at the bottom.
    const closed = gone === true ? null : gone;
    const lines = closed ? closedFareLines(closed) : null;
    const copy = stateCopy("gone");
    return (
      <View testID="fare.root" style={[styles.root, { paddingTop: insets.top }]}>
        <ScreenStatusBar on="light" />
        <View style={styles.goneNav}>
          <BackButton testID="fare.back" onPress={() => router.back()} />
          <Text style={styles.goneNavTitle} accessibilityRole="header">
            Flight details
          </Text>
        </View>
        <ScrollView contentContainerStyle={styles.goneContent}>
          {lines ? (
            <View style={styles.goneRoute} testID="fare.gone.route">
              <SectionLabel box label={lines.day} />
              <Text style={styles.goneRouteTitle}>{lines.route}</Text>
              {lines.carrier ? <Text style={styles.carrier}>{lines.carrier}</Text> : null}
            </View>
          ) : null}
          <StateMessage testID="fare.gone" variant="gone" title={copy.title} body={copy.body} />
        </ScrollView>
        <View style={[styles.footer, styles.goneFooter]}>
          <Button
            testID="fare.alternative"
            label="Request an alternative"
            variant="primary"
            onPress={() =>
              sheetRef.current?.present({
                profile,
                mode: "alternative",
                replacesFareId: typeof id === "string" ? id : undefined,
                fromCode: closed?.from,
                toCode: closed?.to,
                fromCity: closed?.fromCity ?? undefined,
                city: closed?.toCity ?? closed?.to,
              })
            }
          />
          <Text style={styles.caption}>A specialist will call you shortly.</Text>
        </View>
        <RootTabBar active="explore" />
        <RequestSheet ref={sheetRef} />
      </View>
    );
  }

  if (error || !fare) {
    const copy = error ?? stateCopy("route");
    return (
      <View testID="fare.root" style={[styles.root, { paddingTop: insets.top }]}>
        <ScreenStatusBar on="light" />
        <View style={styles.goneNav}>
          <BackButton testID="fare.back" onPress={() => router.back()} />
        </View>
        <View style={[styles.waiting, styles.centered]}>
          <ErrorState
            testID="fare.error"
            variant="error"
            title={copy.title}
            body={copy.body}
            primary={{ label: "Try again", testID: "fare.error.retry", onPress: () => setReloadToken((n) => n + 1) }}
          />
        </View>
        <RootTabBar active="explore" />
      </View>
    );
  }

  const savings = savingsOf(fare.price);
  // An offer's page has its photo band (Figma 135:846): the offer's picture, else its city's photo or satellite view
  // with their credit, else the club's image (ADR-IMPL-043). A search fare's page has none (135:845).
  const band = offer
    ? bandPicture(offer.mediaUrl, photoFor(fare.to.code), {
        headers: PICTURE_HEADERS,
        mapboxToken: env.EXPO_PUBLIC_MAPBOX_TOKEN,
        size: { width, height: HERO_BAND },
      })
    : null;
  const credit = band?.credit ?? null;
  const creditLink = credit?.link ?? null;
  const route = `${fare.from.city}\nto ${fare.to.city}`;

  return (
    <View testID="fare.root" style={styles.root}>
      <ScreenStatusBar on={band && !pastBand ? "dark" : "light"} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        scrollEventThrottle={16}
        onScroll={
          band
            ? (e) => {
                const past = e.nativeEvent.contentOffset.y > HERO_BAND - insets.top;
                if (past !== pastBand) setPastBand(past);
              }
            : undefined
        }
      >
        {band ? (
          <View style={styles.hero}>
            <Photo
              source={band.source}
              fallback={CLUB_PICTURE}
              cachePolicy={band.cache}
              style={StyleSheet.absoluteFill}
              testID="fare.media"
            />
            {/* 436:1220: the photograph under a flat night veil, so the words on it keep their contrast. */}
            <View style={styles.bandVeil} />
            <View style={[styles.heroTop, { paddingTop: insets.top }]}>
              <BackButton testID="fare.back" onPress={() => router.back()} style={styles.backPlate} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.displayOnDark}>{route}</Text>
              <Text style={styles.factsOnDark}>{fare.cabin === "first" ? "FIRST CLASS" : "BUSINESS CLASS"}</Text>
            </View>
          </View>
        ) : (
          <View style={[styles.plain, { paddingTop: insets.top }]}>
            <BackButton testID="fare.back" onPress={() => router.back()} style={styles.back} />
          </View>
        )}

        {credit ? (
          // The credit the photo owes, under it (ADR-IMPL-043).
          <View style={styles.credit}>
            <PhotoCredit
              testID="fare.photoCredit"
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
          </View>
        ) : null}
        <View
          style={[
            styles.details,
            band ? styles.detailsOffer : styles.detailsSearch,
            credit && styles.detailsAfterCredit,
          ]}
        >
          {band ? null : <Text style={styles.display}>{route}</Text>}
          <View style={styles.times}>
            <Text style={styles.carrier}>{carrierLine(fare)}</Text>
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
            <Text style={styles.factsMono}>{factsLine(fare)}</Text>
          </View>
          {band ? null : <Text style={styles.editorial}>{"Your next journey,\nthoughtfully arranged."}</Text>}
          <PricePair price={fare.price} layout="editorial" />
          {savings != null && savings > 0 ? (
            <ListRow
              testID="fare.whyLower"
              size="sm"
              label={`Why it’s ${formatPrice(savings, fare.price.currency)} lower`}
              onPress={() => aboutRef.current?.present()}
            />
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          testID="fare.request"
          label="Request this fare"
          variant="primary"
          onPress={() =>
            sheetRef.current?.present({
              fare,
              profile,
              confirmation: offer ? "offer" : "search",
              photo: offer?.mediaUrl ?? null,
            })
          }
        />
        <Text style={styles.caption}>
          {band ? "A specialist arranges everything by phone." : "No payment is taken in the app."}
        </Text>
      </View>
      <RootTabBar active="explore" />

      {savings != null && savings > 0 ? <AboutFareSheet ref={aboutRef} fare={fare} savings={savings} /> : null}
      <RequestSheet ref={sheetRef} />
    </View>
  );
}

/**
 * Figma 135:847, `About this fare`: why the club's fare is lower — the two fares side by side, the sum written out, when
 * the published fare was recorded and the specialist's promise; `Got it` closes it.
 */
const AboutFareSheet = forwardRef<ModalSheetHandle, { fare: FareVM; savings: number }>(function AboutFareSheet(
  { fare, savings },
  ref,
) {
  const modalRef = useRef<ModalSheetHandle>(null);
  const insets = useSafeAreaInsets();
  useImperativeHandle(ref, () => ({
    present: () => modalRef.current?.present(),
    dismiss: () => modalRef.current?.dismiss(),
    reveal: (target) => modalRef.current?.reveal(target),
  }));
  const comparison = comparisonLine(fare.price);
  return (
    <ModalSheet
      ref={modalRef}
      title="About this fare"
      size="explain"
      closeTestID="fare.whyClose"
      testID="fare.whySheet"
      insets={insets}
    >
      <Text style={styles.headline} accessibilityRole="header">
        {`Why it’s ${formatPrice(savings, fare.price.currency)} lower`}
      </Text>
      <PricePair price={fare.price} layout="detail" />
      <Text style={styles.title}>The comparison</Text>
      {comparison ? <Text style={styles.bodyPrimary}>{comparison}</Text> : null}
      <Text style={styles.note}>{aboutFareNote(fare)}</Text>
      <Button testID="fare.whyGotIt" label="Got it" variant="primary" onPress={() => modalRef.current?.dismiss()} />
    </ModalSheet>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  centered: { alignItems: "center", justifyContent: "center", padding: tokens.space.lg },
  // Loading and the error: the space between the back button and the tab bar.
  waiting: { flex: 1 },
  scroll: { paddingBottom: tokens.space.lg },
  // 135:845: the back button at the top, the route 36 pt under it (128 on the frame).
  back: { marginBottom: 36 },
  // The chevron centred in its white plate (the bare BackButton keeps it 6 pt from its edge, as Figma draws it).
  backPlate: {
    backgroundColor: tokens.colors.surfaceCard,
    borderRadius: tokens.radius.pill,
    alignItems: "center",
    paddingLeft: 0,
  },
  hero: {
    height: HERO_BAND,
    justifyContent: "space-between",
    backgroundColor: tokens.colors.surfaceMuted,
    overflow: "hidden",
  },
  bandVeil: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: tokens.colors.surfaceNight,
    opacity: 0.32,
  },
  heroTop: { paddingHorizontal: tokens.space.lg },
  heroCopy: { paddingHorizontal: tokens.space.lg, paddingBottom: tokens.space.lg, gap: tokens.space.xs },
  plain: { paddingHorizontal: tokens.space.lg },
  display: { ...rn(tokens.type.display), color: tokens.colors.textPrimary },
  displayOnDark: { ...rn(tokens.type.display), color: tokens.colors.textOnDark },
  factsOnDark: { ...rn(tokens.type.factsMono), color: tokens.colors.textOnDark },
  details: { paddingHorizontal: tokens.space.lg },
  // 135:845: the route, the flight, the line, the fares and the comparison 32 pt apart.
  detailsSearch: { gap: tokens.space.xl },
  // 135:846: under the band, 24 pt down; the flight, the fares and the comparison 16 pt apart.
  detailsOffer: { paddingTop: tokens.space.lg, gap: tokens.space.md },
  // Under the credit's 44 pt row (its line in the middle) the details start at once: 13 pt either side of the line.
  detailsAfterCredit: { paddingTop: 0 },
  credit: { paddingHorizontal: tokens.space.lg },
  // 475:8542: the airline, the clocks and the facts 12 pt apart.
  times: { gap: tokens.space.sm },
  carrier: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  timeBlock: { flexDirection: "row", gap: tokens.space.lg },
  timeCol: { flex: 1, gap: tokens.space.xxs },
  timeDisplay: { ...rn(tokens.type.display), color: tokens.colors.textPrimary },
  factsMono: { ...rn(tokens.type.factsMono), color: tokens.colors.textSecondary },
  editorial: { ...rn(tokens.type.title), color: tokens.colors.textPrimary },
  // 135:845: the button and its line pinned over the tab bar, 6 pt above it.
  footer: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.sm,
    paddingBottom: 6,
    gap: tokens.space.xs,
    backgroundColor: tokens.colors.surfacePage,
  },
  // 137:997: the closed fare's footer stands 30 pt over the tab bar.
  goneFooter: { paddingBottom: 30 },
  caption: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary },
  // 137:975: the back button, 16 pt, `Flight details`.
  goneNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
    paddingHorizontal: tokens.space.lg,
  },
  goneNavTitle: { ...rn(tokens.type.titleSm), color: tokens.colors.textPrimary },
  // 137:980: the content 44 pt under the navigation (136 on the frame), its blocks 24 apart.
  goneContent: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: 44,
    paddingBottom: tokens.space.lg,
    gap: tokens.space.lg,
  },
  goneRoute: { gap: tokens.space.sm },
  goneRouteTitle: { ...rn(tokens.type.headline), color: tokens.colors.textPrimary },
  headline: { ...rn(tokens.type.headline), color: tokens.colors.textPrimary },
  title: { ...rn(tokens.type.title), color: tokens.colors.textPrimary },
  bodyPrimary: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
  note: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
});
