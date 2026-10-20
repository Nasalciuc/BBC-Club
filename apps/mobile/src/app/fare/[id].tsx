import type { AirportVM, FareVM } from "@bbc/shared/api/v1/fares";
import type { ProposalDetailVM } from "@bbc/shared/api/v1/proposals";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { type ForwardedRef, forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Linking, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BackButton,
  Button,
  Chip,
  FlightOverview,
  ListRow,
  ModalSheet,
  type ModalSheetHandle,
  Photo,
  PhotoCredit,
  PricePair,
  RoundButton,
  RouteCard,
  RowGroup,
  Skeleton,
  StateMessage,
  YourFareCard,
  cabinText,
  dayText,
  departYmd,
  rn,
  tokens,
} from "@bbc/ui";

import { RequestSheet, type RequestSheetHandle } from "@/components/RequestSheet";
import { RootTabBar } from "@/components/RootTabBar";
import { ScreenStatusBar } from "@/components/screen-status-bar";
import {
  aboutFareLines,
  aboutFareNote,
  comparisonLine,
  savings as savingsOf,
  shareFareText,
} from "@/features/fares/fare-page-logic";
import { bandPicture } from "@/features/places/place-photo-logic";
import { CLUB_PICTURE, PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";
import { airportByCode } from "@/lib/airport-by-code";
import { fetchFare, fetchProfile, fetchProposal, type FareGoneContext, type Profile } from "@/lib/api";
import { env } from "@/lib/env";
import { readFailureCopy, stateCopy } from "@/lib/error-context";
import { savingPercent } from "@/lib/saving";

/** 05: the city's photograph across the top, fading into the page at its foot. */
const HERO = 252;
const FADE = 72;
/** 21: the closed fare's page — the photograph, then the message in the middle of what is left. */
const GONE_TITLE = "This fare is unavailable.";

/**
 * A fare (05, 20, 21): the city's photograph with back and share; the route as its title and the fare's facts as chips;
 * `Your fare` with what it saves; the flight; `About this fare` and `The comparison`; the route on the map; `Request
 * this fare` and `No payment is taken in the app.` over the tab bar. A fare that has closed says so and offers an
 * alternative (21).
 */
export default function FareDetailScreen() {
  const { id, offerId: offerIdParam } = useLocalSearchParams<{ id: string; offerId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const sheetRef = useRef<RequestSheetHandle>(null);
  const aboutRef = useRef<ModalSheetHandle>(null);
  const comparisonRef = useRef<ModalSheetHandle>(null);
  const [fare, setFare] = useState<FareVM | null>(null);
  const [offer, setOffer] = useState<ProposalDetailVM | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [gone, setGone] = useState<FareGoneContext | true | null>(null);
  // `retry: false` — a fare that does not exist: asking again cannot bring it, so the page offers no `Try again`.
  const [error, setError] = useState<{ title: string; body: string; retry?: false } | null>(null);
  // `Try again` loads the fare again, here — it never leaves the page (ADR-IMPL-047).
  const [reloadToken, setReloadToken] = useState(0);
  // The photograph carries the status bar until the page scrolls it away; the page under it then needs dark glyphs.
  const [pastHero, setPastHero] = useState(false);
  // The route's map needs both airports where they are: asked once the fare is known.
  const [airports, setAirports] = useState<{ from: AirportVM; to: AirportVM } | null>(null);
  const closed = gone && gone !== true ? gone : null;
  const city = fare?.to.code ?? closed?.to;
  const photoFor = usePlacePhotos([city]);

  useEffect(() => {
    if (!id || typeof id !== "string") {
      setError({ title: stateCopy("route").title, body: GONE_TITLE, retry: false });
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
        } else if (fareResult.status === 404) {
          // An unknown id (a link): the same words as no id at all, and no `Try again` (ADR-IMPL-047).
          setError({ title: stateCopy("route").title, body: GONE_TITLE, retry: false });
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

  const fromCode = fare?.from.code;
  const toCode = fare?.to.code;
  useEffect(() => {
    if (!fromCode || !toCode) return;
    let cancelled = false;
    void (async () => {
      const [a, b] = await Promise.all([airportByCode(fromCode), airportByCode(toCode)]);
      if (!cancelled && a && b) setAirports({ from: a, to: b });
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [fromCode, toCode]);

  // The offer's own picture, else the city's photograph or satellite view with their credit, else the club's image
  // (ADR-IMPL-043).
  const band = bandPicture(offer?.mediaUrl, photoFor(city), {
    headers: PICTURE_HEADERS,
    mapboxToken: env.EXPO_PUBLIC_MAPBOX_TOKEN,
    size: { width, height: HERO },
  });
  const credit = band.credit;
  const creditLink = credit?.link ?? null;
  const backTop = insets.top + tokens.space.xs;

  const hero = (
    <View style={styles.hero}>
      <Photo
        source={loading ? null : band.source}
        fallback={loading ? null : CLUB_PICTURE}
        cachePolicy={band.cache}
        style={StyleSheet.absoluteFill}
        testID="fare.media"
      />
      <LinearGradient
        colors={[`${tokens.colors.surfacePage}00`, tokens.colors.surfacePage]}
        style={styles.fade}
        pointerEvents="none"
      />
      <BackButton
        testID="fare.back"
        variant="photo"
        onPress={() => router.back()}
        style={StyleSheet.flatten([styles.back, { top: backTop }])}
      />
      {fare ? (
        <RoundButton
          testID="fare.share"
          icon="share"
          accessibilityLabel="Share this fare"
          onPress={() => {
            Share.share({ message: shareFareText(fare) }).catch(() => undefined);
          }}
          style={StyleSheet.flatten([styles.share, { top: backTop }])}
        />
      ) : null}
    </View>
  );

  const creditRow = credit ? (
    // The credit the photograph owes (ADR-IMPL-043).
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
  ) : null;

  // While it loads, and when it did not, the page keeps its photograph's place, its way back and the tab bar.
  if (loading) {
    return (
      <View style={styles.root}>
        <ScreenStatusBar on="light" />
        {hero}
        <View style={styles.content}>
          <Skeleton width="80%" height={36} radius="pill" />
          <Skeleton width={220} height={40} radius="pill" />
          <Skeleton height={104} radius="md" />
          <Skeleton height={120} radius="md" />
        </View>
        <View style={styles.grow} />
        <RootTabBar active="explore" />
      </View>
    );
  }

  if (gone) {
    return (
      <View testID="fare.root" style={styles.root}>
        <ScreenStatusBar on="dark" />
        {hero}
        <View style={styles.goneBody}>
          {creditRow ? <View style={styles.gutter}>{creditRow}</View> : null}
          <View style={styles.goneMessage}>
            <StateMessage
              testID="fare.gone"
              align="center"
              title={GONE_TITLE}
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
                    fromCity: closed?.fromCity ?? undefined,
                    city: closed?.toCity ?? closed?.to,
                  }),
              }}
            />
          </View>
        </View>
        <RootTabBar active="explore" />
        <RequestSheet ref={sheetRef} />
      </View>
    );
  }

  if (error || !fare) {
    const copy = error ?? stateCopy("route");
    return (
      <View testID="fare.root" style={styles.root}>
        <ScreenStatusBar on="light" />
        {hero}
        <View style={[styles.goneMessage, styles.grow]}>
          <StateMessage
            testID="fare.error"
            align="center"
            title={copy.title}
            body={copy.body}
            primary={
              error?.retry === false
                ? undefined
                : { label: "Try again", testID: "fare.error.retry", onPress: () => setReloadToken((n) => n + 1) }
            }
          />
        </View>
        <RootTabBar active="explore" />
      </View>
    );
  }

  const percent = savingPercent(fare.price);
  const saved = savingsOf(fare.price);
  const day = dayText(departYmd(fare));

  return (
    <View testID="fare.root" style={styles.root}>
      <ScreenStatusBar on={pastHero ? "light" : "dark"} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const past = e.nativeEvent.contentOffset.y > HERO - insets.top - FADE;
          if (past !== pastHero) setPastHero(past);
        }}
      >
        {hero}
        <View style={styles.content}>
          {creditRow}
          <Text style={styles.title} accessibilityRole="header">
            {`${fare.from.city} to ${fare.to.city}`}
          </Text>
          {/* The fare's facts, not choices (05): its cabin, one way, its day — one row that scrolls once it is full. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chips}
            testID="fare.chips"
          >
            <Chip testID="fare.chip.cabin" icon="seat" label={cabinText(fare.cabin)} />
            <Chip testID="fare.chip.trip" icon="arrow-right" label="One way" />
            {day ? <Chip testID="fare.chip.day" icon="calendar" label={day} /> : null}
          </ScrollView>
          <YourFareCard testID="fare.price" price={fare.price} percent={percent} />
          <FlightOverview testID="fare.flight" fare={fare} />
          <RowGroup testID="fare.rows">
            <ListRow
              testID="fare.about"
              icon="file-text"
              label="About this fare"
              onPress={() => aboutRef.current?.present()}
            />
            {saved != null && saved > 0 ? (
              <ListRow
                testID="fare.comparison"
                icon="bar-chart"
                label="The comparison"
                onPress={() => comparisonRef.current?.present()}
              />
            ) : null}
          </RowGroup>
          {airports ? (
            <RouteCard
              testID="fare.route"
              from={{ code: airports.from.code, city: fare.from.city, lat: airports.from.lat, lng: airports.from.lng }}
              to={{ code: airports.to.code, city: fare.to.city, lat: airports.to.lat, lng: airports.to.lng }}
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
        <Text style={styles.caption}>No payment is taken in the app.</Text>
      </View>
      <RootTabBar active="explore" />

      <AboutFareSheet ref={aboutRef} fare={fare} />
      {saved != null && saved > 0 ? <ComparisonSheet ref={comparisonRef} fare={fare} /> : null}
      <RequestSheet ref={sheetRef} />
    </View>
  );
}

/** A sheet of the page's own, opened by its row and closed by `Got it` (20). */
function useSheetHandle(ref: ForwardedRef<ModalSheetHandle>) {
  const modalRef = useRef<ModalSheetHandle>(null);
  useImperativeHandle(ref, () => ({
    present: () => modalRef.current?.present(),
    dismiss: () => modalRef.current?.dismiss(),
    reveal: (target) => modalRef.current?.reveal(target),
  }));
  return modalRef;
}

/** `About this fare` (20): what the fare is, and what the specialist does — in the club's own facts. */
const AboutFareSheet = forwardRef<ModalSheetHandle, { fare: FareVM }>(function AboutFareSheet({ fare }, ref) {
  const modalRef = useSheetHandle(ref);
  const insets = useSafeAreaInsets();
  const [first, second] = aboutFareLines({ ...fare, day: departYmd(fare) });
  return (
    <ModalSheet
      ref={modalRef}
      title="About this fare"
      size="explain"
      closeTestID="fare.aboutClose"
      testID="fare.aboutSheet"
      insets={insets}
      footer={
        <Button testID="fare.aboutGotIt" label="Got it" variant="primary" onPress={() => modalRef.current?.dismiss()} />
      }
    >
      <Text style={styles.sheetBody}>{first}</Text>
      <Text style={styles.sheetBody}>{second}</Text>
    </ModalSheet>
  );
});

/**
 * `The comparison`: the club's fare beside the published one with its source, the sum written out, and when the
 * published fare was recorded — only where it is on record.
 */
const ComparisonSheet = forwardRef<ModalSheetHandle, { fare: FareVM }>(function ComparisonSheet({ fare }, ref) {
  const modalRef = useSheetHandle(ref);
  const insets = useSafeAreaInsets();
  const comparison = comparisonLine(fare.price);
  return (
    <ModalSheet
      ref={modalRef}
      title="The comparison"
      size="explain"
      closeTestID="fare.comparisonClose"
      testID="fare.comparisonSheet"
      insets={insets}
      footer={
        <Button
          testID="fare.comparisonGotIt"
          label="Got it"
          variant="primary"
          onPress={() => modalRef.current?.dismiss()}
        />
      }
    >
      <PricePair price={fare.price} layout="detail" />
      {comparison ? <Text style={styles.sheetBody}>{comparison}</Text> : null}
      <Text style={styles.note}>{aboutFareNote(fare)}</Text>
    </ModalSheet>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  grow: { flex: 1 },
  scroll: { paddingBottom: tokens.space.lg },
  hero: { height: HERO, backgroundColor: tokens.colors.surfaceTint },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0, height: FADE },
  back: { position: "absolute", left: tokens.space.gutter },
  share: { position: "absolute", right: tokens.space.gutter },
  content: { paddingHorizontal: tokens.space.gutter, gap: tokens.space.sm },
  title: { ...rn(tokens.type.display), color: tokens.colors.textPrimary },
  chipsScroll: { marginHorizontal: -tokens.space.gutter, flexGrow: 0 },
  chips: { flexDirection: "row", gap: tokens.space.xs, paddingHorizontal: tokens.space.gutter },
  // 05: the pill and its line pinned over the tab bar.
  footer: {
    paddingHorizontal: tokens.space.gutter,
    paddingTop: tokens.space.sm,
    paddingBottom: tokens.space.xs,
    gap: tokens.space.xs,
    backgroundColor: tokens.colors.surfacePage,
  },
  caption: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary, textAlign: "center" },
  gutter: { paddingHorizontal: tokens.space.gutter },
  // 21: the message 40 pt under the photograph, centred.
  goneBody: { flex: 1 },
  goneMessage: { paddingHorizontal: tokens.space.gutter, paddingTop: tokens.space.xxl },
  sheetBody: { ...rn(tokens.type.bodyLg), color: tokens.colors.textPrimary },
  note: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
});
