import type { AirportVM, FareVM } from "@bbc/shared/api/v1/fares";
import type { ProposalDetailVM } from "@bbc/shared/api/v1/proposals";
import { useLocalSearchParams, useRouter } from "expo-router";
import { type ForwardedRef, forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Linking, ScrollView, Share, StyleSheet, Text, type TextStyle, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ABOUT_BODY,
  Button,
  Chip,
  FareOverviewCard,
  FareRouteCard,
  FareSummaryCard,
  ListRow,
  ModalSheet,
  type ModalSheetHandle,
  PhotoCredit,
  PricePair,
  RoundButton,
  RowGroup,
  Skeleton,
  StateMessage,
  baselineOffset,
  belowBaseline,
  cabinText,
  rn,
  tokens,
} from "@bbc/ui";

import { RequestSheet, type RequestSheetHandle } from "@/components/RequestSheet";
import { RootTabBar } from "@/components/RootTabBar";
import { ScreenStatusBar } from "@/components/screen-status-bar";
import { datesShortLabel, travelersLabel } from "@/features/explore/travel-preferences";
import { airlineRibbon } from "@/features/fares/airline-marks";
import { FARE_HERO, FareHero, fareHeroBottom, type HeroPage } from "@/features/fares/FareHero";
import {
  aboutFareLines,
  aboutFareNote,
  comparisonLine,
  fareDates,
  fareSearchFromParams,
  savings as savingsOf,
  shareFareText,
} from "@/features/fares/fare-page-logic";
import { knownCarrier } from "@/features/fares/known-carrier";
import { useFareWeather } from "@/features/fares/weather";
import { CABIN_PHOTOS, clubPhoto } from "@/features/places/club-photos";
import { bandPicture } from "@/features/places/place-photo-logic";
import { PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";
import { toggleSaved, useIsSaved } from "@/features/saved/saved";
import { airportByCode } from "@/lib/airport-by-code";
import { fetchFare, fetchProfile, fetchProposal, type FareGoneContext, type Profile } from "@/lib/api";
import { env } from "@/lib/env";
import { readFailureCopy, stateCopy } from "@/lib/error-context";
import { savingPercent } from "@/lib/saving";

/** 21's message. */
const GONE_TITLE = "This fare is unavailable.";
const STATUS = 47;

/**
 * 05 from the screen's top on a 47-pt status bar (pt), under the photographs (`FareHero`): the route's title on 288.5,
 * 15.5 in; the chips from 299.8, 15.2 in, 7.1 apart; the weather and the fare from 337.2, 14.8 and 13.8 from the edges;
 * `Flight overview` from 420.4, the rows from 517.2 (37.5 each), `The route` from 601.3 — 15 and 14.1 from the edges;
 * over the tab bar, the pill 39.3 tall 7.1 under what scrolls, 15.2 and 14.1 in, its words 0.47 over its middle, and
 * `No payment is taken in the app.` 13.2 under it and 8.7 over the tab bar (as the web harness renders the margins
 * below: 14.16 and 7.74).
 */
const PAGE = {
  title: { baseline: 288.5, left: 15.5 },
  chips: { top: 299.8, left: 15.2, gap: 7.1, height: 26.8 },
  summary: { top: 337.2, left: 14.8, right: 13.8, height: 73.3 },
  overview: { top: 420.4, left: 15, right: 14.1, height: 89.8 },
  rows: { top: 517.22, left: 15, right: 14.1, row: 37.5 },
  route: { top: 601.27, left: 15, right: 14.1 },
  pill: { height: 39.3, left: 15.2, right: 14.1, above: 7.1, lift: 0.47, fineBelow: 14.16, fineAboveTabs: 7.74 },
} as const;

/** 21: the message centred on 305.1, the pill 41.5 tall from 328.9, 15.3 and 14.6 in, its words 0.44 over its middle. */
const GONE = { title: 305.1, pill: { top: 328.9, height: 41.5, left: 15.3, right: 14.6, lift: 0.44 } } as const;

type Role = TextStyle & { fontSize: number; lineHeight: number };
const TITLE = rn(tokens.type.fareTitle) as Role;
const FINE = rn(tokens.type.fareFine) as Role;
const GONE_ROLE = rn(tokens.type.goneTitle) as Role;

/**
 * A fare (05, 20, 21): the city's photograph, the seat and the lounge, with back, share and the heart; the route as its
 * title and the trip as chips; the weather beside `Your fare` and what it saves; the flight; `About this fare` and
 * `The comparison`; the route on the map; `Request this fare` and `No payment is taken in the app.` over the tab bar.
 * A fare that has closed says so and offers an alternative (21).
 */
export default function FareDetailScreen() {
  const params = useLocalSearchParams();
  const id = typeof params.id === "string" ? params.id : undefined;
  const offerIdParam = typeof params.offerId === "string" ? params.offerId : undefined;
  const search = fareSearchFromParams(params);
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
  const saved = useIsSaved("fare", id);
  const closed = gone && gone !== true ? gone : null;
  const city = fare?.to.code ?? closed?.to;
  const photoFor = usePlacePhotos([city]);
  // The fare's own day when it has one; a searched range never stands over the flight shown (fareDates).
  const dates = fare ? fareDates(fare, search) : { depart: search.depart, return: null };
  const weather = useFareWeather();

  useEffect(() => {
    if (!id) {
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
        (offerIdParam && offerIdParam.length > 0 ? offerIdParam : null) ?? fareResult.data.offerId;
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

  // The design's photograph of the city where it has one (ADR-IMPL-056); else the offer's own picture or the city's
  // photograph with its credit (ADR-IMPL-043). Then the seat — a business-class one, so only for Business — and the
  // lounge.
  const bundled = clubPhoto(city, "any");
  const band = bandPicture(offer?.mediaUrl, photoFor(city), {
    headers: PICTURE_HEADERS,
    mapboxToken: env.EXPO_PUBLIC_MAPBOX_TOKEN,
    size: { width, height: fareHeroBottom(false) + insets.top - STATUS },
  });
  const credit = bundled ? null : band.credit;
  const creditLink = credit?.link ?? null;
  const cityName = fare?.to.city ?? closed?.toCity ?? null;
  const pages: HeroPage[] = loading
    ? []
    : [
        {
          source: bundled ?? band.source,
          label: cityName ?? "The destination",
          position: bundled ? { top: 0, right: 0 } : undefined,
          cache: bundled ? "memory-disk" : band.cache,
        },
        ...(fare && fare.cabin === "business"
          ? [{ source: CABIN_PHOTOS.seat.full, thumb: CABIN_PHOTOS.seat.thumb, label: "The business-class seat" }]
          : []),
        ...(fare ? [{ source: CABIN_PHOTOS.lounge.full, thumb: CABIN_PHOTOS.lounge.thumb, label: "The lounge" }] : []),
      ];

  const dy = insets.top - STATUS;
  const heroBottom = fareHeroBottom(Boolean(gone)) + dy;

  const creditRow = credit ? (
    // The credit the photograph owes (ADR-IMPL-043).
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
  ) : null;

  const hero = (
    <FareHero
      testID="fare.hero"
      pages={pages}
      insetTop={insets.top}
      gone={Boolean(gone)}
      onBack={() => router.back()}
      actions={
        fare && id
          ? ({ top, size }) => (
              <>
                <RoundButton
                  testID="fare.share"
                  icon="share"
                  accessibilityLabel="Share this fare"
                  diameter={size}
                  iconSize={15.5}
                  strokeWidth={1.7}
                  onPress={() => {
                    Share.share({ message: shareFareText(fare) }).catch(() => undefined);
                  }}
                  style={StyleSheet.flatten([styles.round, { top, left: FARE_HERO.round.share }])}
                />
                <RoundButton
                  testID="fare.save"
                  icon="heart"
                  selectedIcon="heart-fill"
                  selected={saved}
                  accessibilityLabel={saved ? "Saved: this fare" : "Save this fare"}
                  diameter={size}
                  iconSize={16.6}
                  strokeWidth={1.49}
                  onPress={() => toggleSaved("fare", id)}
                  style={StyleSheet.flatten([styles.round, { top, left: FARE_HERO.round.heart }])}
                />
              </>
            )
          : undefined
      }
    />
  );

  // While it loads, and when it did not, the page keeps its photograph's place, its way back and the tab bar.
  if (loading) {
    return (
      <View style={styles.root}>
        <ScreenStatusBar on="dark" />
        {hero}
        <View style={styles.skeletons}>
          <Skeleton width="80%" height={33} radius="pill" />
          <Skeleton width={260} height={PAGE.chips.height} radius="pill" />
          <Skeleton height={PAGE.summary.height} radius="md" />
          <Skeleton height={PAGE.overview.height} radius="md" />
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
        <View style={styles.grow} testID="fare.gone">
          <Text
            style={[
              GONE_ROLE,
              styles.navy,
              styles.centred,
              { marginTop: GONE.title + dy - baselineOffset(GONE_ROLE) - heroBottom },
            ]}
            accessibilityRole="header"
          >
            {GONE_TITLE}
          </Text>
          <View
            style={{
              marginTop: GONE.pill.top - (GONE.title - baselineOffset(GONE_ROLE) + GONE_ROLE.lineHeight),
              paddingLeft: GONE.pill.left,
              paddingRight: GONE.pill.right,
            }}
          >
            <Button
              testID="fare.alternative"
              label="Request an alternative"
              variant="primary"
              height={GONE.pill.height}
              text="buttonGone"
              style={{ paddingBottom: 2 * GONE.pill.lift }}
              onPress={() =>
                sheetRef.current?.present({
                  profile,
                  mode: "alternative",
                  replacesFareId: id,
                  fromCode: closed?.from,
                  toCode: closed?.to,
                  fromCity: closed?.fromCity ?? undefined,
                  city: closed?.toCity ?? closed?.to,
                })
              }
            />
          </View>
          {creditRow}
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
        <ScreenStatusBar on="dark" />
        {hero}
        <View style={[styles.message, styles.grow]}>
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
  const difference = savingsOf(fare.price);
  const comparable = difference != null && difference > 0;
  const passengers = search.passengers ?? profile?.preferences.passengers ?? null;
  const days = datesShortLabel(dates);
  const rows = comparable ? 2 : 1;
  const titleTop = PAGE.title.baseline - baselineOffset(TITLE);
  const fadeFrom = FARE_HERO.fade.from + dy;

  return (
    <View testID="fare.root" style={styles.root}>
      <ScreenStatusBar on={pastHero ? "light" : "dark"} />
      <ScrollView
        scrollEventThrottle={16}
        onScroll={(e) => {
          const past = e.nativeEvent.contentOffset.y > fadeFrom - insets.top;
          if (past !== pastHero) setPastHero(past);
        }}
      >
        {hero}
        <Text
          style={[
            TITLE,
            styles.navy,
            { marginTop: titleTop + dy - heroBottom, marginLeft: PAGE.title.left, marginRight: PAGE.title.left },
          ]}
          accessibilityRole="header"
          numberOfLines={2}
        >
          {`${fare.from.city} to ${fare.to.city}`}
        </Text>
        {/* The trip, as facts: the cabin, what the price is for, who travels and when — one row that scrolls once full. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.chipsScroll, { marginTop: PAGE.chips.top - (titleTop + TITLE.lineHeight) }]}
          contentContainerStyle={[styles.chips, { paddingLeft: PAGE.chips.left, paddingRight: PAGE.chips.left }]}
          testID="fare.chips"
        >
          <Chip
            testID="fare.chip.cabin"
            look="fare"
            icon={fare.cabin === "first" ? "seat-first" : "seat"}
            label={cabinText(fare.cabin)}
          />
          {fare.trip ? (
            <Chip
              testID="fare.chip.trip"
              look="fare"
              icon={fare.trip === "round_trip" ? "round-trip" : "arrow-right"}
              label={fare.trip === "round_trip" ? "Round trip" : "One way"}
            />
          ) : null}
          {passengers ? (
            <Chip testID="fare.chip.travelers" look="fare" icon="user" label={travelersLabel(passengers)} />
          ) : null}
          {days ? <Chip testID="fare.chip.dates" look="fare" icon="calendar" label={days} /> : null}
        </ScrollView>
        <View
          style={{
            marginTop: PAGE.summary.top - (PAGE.chips.top + PAGE.chips.height),
            marginLeft: PAGE.summary.left,
            marginRight: PAGE.summary.right,
          }}
        >
          <FareSummaryCard testID="fare.price" price={fare.price} percent={percent} weather={weather} />
        </View>
        <View
          style={{
            marginTop: PAGE.overview.top - (PAGE.summary.top + PAGE.summary.height),
            marginLeft: PAGE.overview.left,
            marginRight: PAGE.overview.right,
          }}
        >
          <FareOverviewCard
            testID="fare.flight"
            // A fare that names no airline prints none (never `Unknown`), as the request records none.
            fare={knownCarrier(fare.carrier) ? fare : { ...fare, carrier: { ...fare.carrier, name: "" } }}
            ribbon={airlineRibbon(fare.carrier.code)}
          />
        </View>
        <View
          style={{
            marginTop: PAGE.rows.top - (PAGE.overview.top + PAGE.overview.height),
            marginLeft: PAGE.rows.left,
            marginRight: PAGE.rows.right,
          }}
        >
          <RowGroup testID="fare.rows" look="fare" rowHeight={PAGE.rows.row}>
            <ListRow
              testID="fare.about"
              icon="document"
              label="About this fare"
              onPress={() => aboutRef.current?.present()}
            />
            {comparable ? (
              <ListRow
                testID="fare.comparison"
                icon="bar-chart"
                label="The comparison"
                onPress={() => comparisonRef.current?.present()}
              />
            ) : null}
          </RowGroup>
        </View>
        {airports ? (
          <View
            style={{
              marginTop: PAGE.route.top - (PAGE.rows.top + rows * PAGE.rows.row),
              marginLeft: PAGE.route.left,
              marginRight: PAGE.route.right,
            }}
          >
            <FareRouteCard
              testID="fare.route"
              from={{ code: airports.from.code, city: fare.from.city, lat: airports.from.lat, lng: airports.from.lng }}
              to={{ code: airports.to.code, city: fare.to.city, lat: airports.to.lat, lng: airports.to.lng }}
            />
          </View>
        ) : null}
        {creditRow}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          testID="fare.request"
          label="Request this fare"
          variant="primary"
          height={PAGE.pill.height}
          text="buttonFare"
          style={{ paddingBottom: 2 * PAGE.pill.lift }}
          onPress={() =>
            sheetRef.current?.present({
              fare,
              profile,
              confirmation: offer ? "offer" : "search",
              photo: offer?.mediaUrl ?? null,
              search:
                search.depart || search.passengers
                  ? {
                      dates: { depart: search.depart, return: search.return, flexible: search.depart === null },
                      cabin: fare.cabin,
                      passengers: search.passengers ??
                        profile?.preferences.passengers ?? { adult: 1, child: 0, infant: 0 },
                    }
                  : null,
            })
          }
        />
        <Text style={[FINE, styles.fine]}>No payment is taken in the app.</Text>
      </View>
      <RootTabBar active="explore" />

      <AboutFareSheet
        ref={aboutRef}
        fare={fare}
        depart={dates.depart}
        ret={dates.return}
        passengers={search.passengers}
      />
      {comparable ? <ComparisonSheet ref={comparisonRef} fare={fare} /> : null}
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

/** A range of days stays on one line (`12–19,` as 20 sets it): no break at its dash — word joiners either side. */
function keepRangesTogether(text: string): string {
  return text.replace(/(\d)–(\d)/g, "$1\u2060–\u2060$2");
}

/** 20's `Got it`: 39.2 tall, its words 0.47 over its middle. */
const GOT_IT = { height: 39.2, lift: 0.51 } as const;

/**
 * `About this fare` (20): what the fare is — round trip or one way, for whom, the route by its cities and codes, the
 * days — and what the specialist does, in the club's own facts.
 */
const AboutFareSheet = forwardRef<
  ModalSheetHandle,
  {
    fare: FareVM;
    depart: string | null;
    ret: string | null;
    passengers: { adult: number; child: number; infant: number } | null;
  }
>(function AboutFareSheet({ fare, depart, ret, passengers }, ref) {
  const modalRef = useSheetHandle(ref);
  const insets = useSafeAreaInsets();
  const [first, second] = aboutFareLines({ ...fare, depart, return: ret, passengers }).map(keepRangesTogether);
  return (
    <ModalSheet
      ref={modalRef}
      title="About this fare"
      size="explain"
      look="about"
      closeTestID="fare.aboutClose"
      testID="fare.aboutSheet"
      insets={insets}
      footer={
        <Button
          testID="fare.aboutGotIt"
          label="Got it"
          variant="primary"
          height={GOT_IT.height}
          text="buttonAbout"
          style={{ paddingBottom: 2 * GOT_IT.lift }}
          onPress={() => modalRef.current?.dismiss()}
        />
      }
    >
      <Text style={[ABOUT_BODY, styles.navy]}>{first}</Text>
      <Text style={[ABOUT_BODY, styles.navy]}>{second}</Text>
    </ModalSheet>
  );
});

/**
 * `The comparison`: the club's fare beside the published one with its source, the sum written out, and when the
 * published fare was recorded — only where it is on record. No image draws it: it takes 20's sheet.
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
      look="about"
      closeTestID="fare.comparisonClose"
      testID="fare.comparisonSheet"
      insets={insets}
      footer={
        <Button
          testID="fare.comparisonGotIt"
          label="Got it"
          variant="primary"
          height={GOT_IT.height}
          text="buttonAbout"
          style={{ paddingBottom: 2 * GOT_IT.lift }}
          onPress={() => modalRef.current?.dismiss()}
        />
      }
    >
      <PricePair price={fare.price} layout="detail" />
      {comparison ? <Text style={[ABOUT_BODY, styles.navy]}>{comparison}</Text> : null}
      <Text style={[ABOUT_BODY, styles.slate]}>{aboutFareNote(fare)}</Text>
    </ModalSheet>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  grow: { flex: 1 },
  navy: { color: tokens.colors.textPrimary },
  slate: { color: tokens.colors.textSecondary },
  centred: { textAlign: "center", paddingHorizontal: tokens.space.gutter },
  round: { position: "absolute" },
  skeletons: { paddingHorizontal: tokens.space.gutter, paddingTop: tokens.space.lg, gap: tokens.space.sm },
  chipsScroll: { flexGrow: 0 },
  chips: { flexDirection: "row", gap: PAGE.chips.gap },
  credit: { paddingHorizontal: PAGE.overview.left },
  // 05: the pill and its line pinned over the tab bar, the page's white around them.
  footer: {
    paddingTop: PAGE.pill.above,
    paddingLeft: PAGE.pill.left,
    paddingRight: PAGE.pill.right,
    backgroundColor: tokens.colors.surfacePage,
  },
  fine: {
    color: tokens.colors.textSecondary,
    textAlign: "center",
    marginTop: PAGE.pill.fineBelow - baselineOffset(FINE),
    marginBottom: PAGE.pill.fineAboveTabs - belowBaseline(FINE),
  },
  message: { paddingHorizontal: tokens.space.gutter, paddingTop: tokens.space.xxl },
});
