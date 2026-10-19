import { useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { BackHandler, Keyboard, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AirportRow,
  Button,
  CabinCard,
  EmptyState,
  FieldError,
  InfoCard,
  PROGRESS_HEIGHT,
  ProgressLine,
  SearchField,
  StateMessage,
  Stepper,
  TextButton,
  Wordmark,
  baselineOffset,
  belowBaseline,
  rn,
  tokens,
} from "@bbc/ui";
import type { AirportVM } from "@bbc/shared/api/v1/fares";

import { ScreenStatusBar } from "@/components/screen-status-bar";
import { deviceTimeZone } from "@/features/explore/discovery-logic";
import { HOME_CARD, HomeAirportCard } from "@/features/onboarding/HomeAirportCard";
import { airportSearchState, nearFirst, rowCities, wantsAirportSearch } from "@/lib/airport-search-state";
import { fetchAirports, fetchHomeSuggestion, patchProfile, putTravelPreferences } from "@/lib/api";
import { stateCopy } from "@/lib/error-context";
import { appStorage, ONBOARDED_KEY } from "@/lib/storage-keys";

const EXPLORE = "/(tabs)/explore" as Href;

function markOnboarded() {
  appStorage.set(ONBOARDED_KEY, true);
}

/**
 * Onboarding (01, 14, 15): one question — where the member usually flies from — with the cabin and who usually
 * travels, on one screen; the home airport opens its search in place (14), which keeps the time zone's suggestion
 * (ADR-IMPL-039). The line at the top fills as the three are answered.
 */
export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<"form" | "airport">("form");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AirportVM | null>(null);
  const [search, setSearch] = useState(() => airportSearchState<AirportVM>("idle"));
  // `Try again` runs the search effect once more: its answer is dropped like any other if the member has typed on,
  // chosen or cancelled by the time it comes.
  const [attempt, setAttempt] = useState(0);
  const [cabin, setCabin] = useState<"business" | "first">("business");
  const [cabinTouched, setCabinTouched] = useState(false);
  const [adult, setAdult] = useState(1);
  const [travelersTouched, setTravelersTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ADR-IMPL-039: the busiest airport in the phone's time zone, offered — never chosen — for the member.
  const [suggested, setSuggested] = useState<AirportVM | null>(null);

  useEffect(() => {
    const tz = deviceTimeZone();
    if (!tz) return;
    let cancelled = false;
    void (async () => {
      const result = await fetchHomeSuggestion(tz);
      if (!cancelled && result.ok) setSuggested(result.data.airport);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!wantsAirportSearch(query, selected)) {
      setSearch(airportSearchState("idle"));
      return;
    }
    setSearch(airportSearchState("loading"));
    // An answer still on its way when the member types on, or chooses, is dropped: it would reopen the list.
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        const result = await fetchAirports(query);
        // The phone's own zone first (14: `New` brings New York's three airports before New Orleans).
        if (!cancelled)
          setSearch(
            airportSearchState(result.ok ? { ...result, data: nearFirst(result.data, deviceTimeZone()) } : result),
          );
      })();
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, selected, attempt]);

  // Android's Back on the airport search goes back to the form, as Cancel does (ADR-IMPL-047); on the form it leaves
  // as it always did.
  useEffect(() => {
    if (Platform.OS !== "android" || step !== "airport") return;
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      Keyboard.dismiss();
      setStep("form");
      return true;
    });
    return () => back.remove();
  }, [step]);

  async function onContinue() {
    if (!selected) {
      // The card only opens the search: there is nothing to type here.
      setError("Choose your home airport to continue.");
      return;
    }

    setBusy(true);
    setError(null);

    const airportResult = await patchProfile({ homeAirport: selected.code });
    if (!airportResult.ok) {
      setBusy(false);
      setError(airportResult.message);
      return;
    }

    const prefsResult = await putTravelPreferences({
      cabin,
      passengers: { adult, child: 0, infant: 0 },
    });
    if (!prefsResult.ok) {
      setBusy(false);
      setError(prefsResult.message);
      return;
    }

    markOnboarded();
    setBusy(false);
    router.replace(EXPLORE);
  }

  function onSkip() {
    markOnboarded();
    router.replace(EXPLORE);
  }

  function openAirportStep() {
    setQuery("");
    setSearch(airportSearchState("idle"));
    setError(null);
    setStep("airport");
  }

  function closeAirportStep() {
    Keyboard.dismiss();
    setStep("form");
  }

  function choose(airport: AirportVM) {
    // The choice ends the typing: the keyboard goes, and the form shows the airport's card.
    Keyboard.dismiss();
    setSelected(airport);
    setQuery("");
    setSearch(airportSearchState("idle"));
    setStep("form");
  }

  // The line fills as the three questions are answered (the owner's direction for 01): the airport, the cabin, the party.
  const answered = (selected ? 1 : 0) + (cabinTouched ? 1 : 0) + (travelersTouched ? 1 : 0);

  const header = (
    <>
      <View style={styles.progress}>
        <ProgressLine fraction={answered / 3} />
      </View>
      <View style={styles.wordmark}>
        <Wordmark />
      </View>
      {/* 01 breaks the question after `usually`. */}
      <Text style={styles.title} accessibilityRole="header">
        {"Where do you usually\nfly from?"}
      </Text>
      <Text style={styles.body}>So we start with the right fares. You can change this later.</Text>
    </>
  );

  if (step === "airport") {
    const typing = query.trim().length >= 2;
    const cities = rowCities(search.airports);
    return (
      <View style={[styles.root, { paddingTop: insets.top }]} testID="onboarding.root">
        <ScreenStatusBar on="light" />
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + tokens.space.lg }}
          keyboardShouldPersistTaps="handled"
        >
          {header}
          <Text style={styles.fieldLabel}>City or airport code</Text>
          <View style={styles.field}>
            <SearchField
              testID="onboarding.airport.query"
              placeholder="City or airport code"
              editable
              autoFocus
              tone="field"
              look="onboarding"
              value={query ? { text: query } : null}
              onChangeText={setQuery}
              onClear={() => setQuery("")}
              onCancel={closeAirportStep}
            />
          </View>
          <Text style={styles.helper}>
            {suggested ? "City, airport or code — suggested from your time zone." : "City, airport or code."}
          </Text>

          {suggested && !typing ? (
            <View style={styles.rows}>
              <AirportRow
                testID={`onboarding.airport.suggested.${suggested.code}`}
                layout="code"
                code={suggested.code}
                city={suggested.city}
                airport={suggested.name}
                onPress={() => choose(suggested)}
              />
            </View>
          ) : search.phase === "empty" ? (
            <View style={styles.message}>
              <EmptyState
                testID="onboarding.airport.empty"
                look="search"
                icon="search"
                title="No airports found"
                body="Try a city name or a three-letter airport code, such as JFK."
                primary={{ label: "Clear search", onPress: () => setQuery("") }}
                primaryVariant="outline"
                primaryFill={false}
              />
            </View>
          ) : search.phase === "error" ? (
            <View style={styles.message}>
              <StateMessage
                testID="onboarding.airport.error"
                variant="error"
                title={stateCopy("generic").title}
                body={stateCopy("generic").body}
                primary={{ label: "Try again", onPress: () => setAttempt((n) => n + 1) }}
              />
            </View>
          ) : search.airports.length > 0 ? (
            <View style={styles.rows}>
              {search.airports.map((a) => (
                <AirportRow
                  key={a.code}
                  testID={`onboarding.airport.hit.${a.code}`}
                  layout="code"
                  code={a.code}
                  city={cities.get(a.code) ?? a.city}
                  airport={a.name}
                  onPress={() => choose(a)}
                />
              ))}
            </View>
          ) : null}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="onboarding.root">
      <ScreenStatusBar on="light" />
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        {header}

        <Text style={[styles.label, styles.labelAirport]}>Your home airport</Text>
        <View style={styles.airport}>
          <HomeAirportCard
            testID="onboarding.airport"
            airport={selected}
            error={Boolean(error) && !selected}
            onPress={openAirportStep}
          />
          {error ? <FieldError testID="onboarding.error">{error}</FieldError> : null}
        </View>

        <Text style={[styles.label, styles.labelCabin]}>Preferred cabin</Text>
        <View style={styles.cabins}>
          <CabinCard
            testID="onboarding.cabin.business"
            cabin="business"
            title="Business"
            line={"More space,\na better journey"}
            selected={cabin === "business"}
            onPress={() => {
              setCabin("business");
              setCabinTouched(true);
            }}
          />
          <CabinCard
            testID="onboarding.cabin.first"
            cabin="first"
            title="First"
            line={"The highest\nlevel of comfort"}
            selected={cabin === "first"}
            onPress={() => {
              setCabin("first");
              setCabinTouched(true);
            }}
          />
        </View>

        <Text style={[styles.label, styles.labelTravelers]}>Who usually travels</Text>
        <View style={styles.travelers}>
          <Stepper
            testID="onboarding.travelers.adult"
            look="onboarding"
            icon="adult"
            label="Adults"
            caption="Ages 18+"
            value={adult}
            min={1}
            max={9}
            onChange={(n) => {
              setAdult(n);
              setTravelersTouched(true);
            }}
          />
        </View>
        <View style={styles.family}>
          <InfoCard
            testID="onboarding.children"
            look="family"
            icon="family"
            title="Travelling with children?"
            body="Add their ages in a note when you request."
          />
        </View>
      </ScrollView>

      <View
        style={[styles.actions, { paddingBottom: insets.bottom + ACTIONS.skipAboveSafe - belowBaseline(skipType) }]}
      >
        <Button
          testID="onboarding.continue"
          label={busy ? "Saving…" : "Continue"}
          trailing={busy ? undefined : "arrow"}
          busy={busy}
          variant="primary"
          height={ACTIONS.height}
          radius={ACTIONS.radius}
          text="buttonOnboard"
          trailingSize={17}
          trailingStroke={2}
          trailingGap={5.4}
          style={styles.continue}
          onPress={() => void onContinue()}
        />
        <View style={styles.skip}>
          <TextButton testID="onboarding.skip" label="Skip" tone="muted" text="skip" disabled={busy} onPress={onSkip} />
        </View>
      </View>
    </View>
  );
}

/**
 * 01, measured on a 47-pt status bar (pt under the safe area; each text where its ink lies on the image): the line 3.2
 * down, 15.4 from either edge; the wordmark's baseline 40.3, the question's 93.9 and 32 under it, its words' 153.3; each
 * section's label 26–29 pt under what comes before it (baselines 197.9, 413.2, 536.1) with its card 6–7 pt under it; the
 * cards 17.6 in, 16.3 short of the right. At the foot, pinned: `Continue` 45 tall (radius 19), `Skip`'s baseline 26.4
 * under its top and 8.7 above the safe area's foot.
 */
const ONB = {
  progressTop: 3.2,
  progressInset: 15.4,
  wordmarkBaseline: 40.3,
  questionBaseline: 93.9,
  subBaseline: 153.3,
  labelX: 18.6,
  cardLeft: 17.6,
  cardRight: 16.3,
  airportLabel: 197.9,
  airportTop: 207.6,
  cabinLabel: 413.2,
  cabinTop: 423.45,
  cabinGap: 7.7,
  travelersLabel: 536.1,
  travelersTop: 546.4,
  familyTop: 617.8,
  cabinsHeight: 72.8,
  travelersHeight: 63.1,
} as const;
const ACTIONS = { height: 45, radius: 19, skipBelowButton: 26.4, skipAboveSafe: 8.7, gapAbove: 13.3 } as const;
/**
 * 14 and 15 under the same header: the field's label at baseline 182, the field 189.8–233.6 (18.4 in, 301.8 wide with
 * `Cancel` after it), the helper's baseline 253.6, the first row 276.2 (rows 8.7 apart, 17.8 in, 16.8 short of the
 * right); 15's magnifier 296.15.
 */
const SEARCH = {
  labelBaseline: 182,
  fieldTop: 189.8,
  fieldHeight: 43.8,
  helperBaseline: 253.6,
  rowsTop: 276.2,
  emptyTop: 296.15,
} as const;
const fieldLabelType = tokens.type.onboardFieldLabel;
const helperType = tokens.type.onboardHelper;

const wordmarkType = tokens.type.wordmark;
// The larger ` Club` sets the wordmark's line: its baseline sits this far under the line's top on every platform.
const WORDMARK_LINE = {
  height:
    baselineOffset({ fontSize: tokens.type.wordmarkClub.fontSize, lineHeight: wordmarkType.lineHeight }) +
    belowBaseline(wordmarkType),
  baseline: baselineOffset({ fontSize: tokens.type.wordmarkClub.fontSize, lineHeight: wordmarkType.lineHeight }),
};
const questionType = tokens.type.question;
const subType = tokens.type.questionSub;
const labelType = tokens.type.onboardLabel;
const skipType = tokens.type.skip;
const buttonType = tokens.type.buttonOnboard;

/** Where a text whose baseline is at `baseline` starts, after a box that ends at `prev` (both under the safe area). */
const after = (prev: number, baseline: number, t: { fontSize: number; lineHeight: number }) =>
  baseline - baselineOffset(t) - prev;

const progressBottom = ONB.progressTop + PROGRESS_HEIGHT;
const wordmarkTop = ONB.wordmarkBaseline - WORDMARK_LINE.baseline;
const wordmarkBottom = wordmarkTop + WORDMARK_LINE.height;
const questionBottom = ONB.questionBaseline - baselineOffset(questionType) + 2 * questionType.lineHeight;
const subBottom = ONB.subBaseline + belowBaseline(subType);
const labelBottom = (baseline: number) => baseline + belowBaseline(labelType);
// `Continue`'s words sit 28.1 under its top in 01 (their ink's middle as the image draws it), lower than centred.
const LABEL_DROP = 28.1 - (ACTIONS.height / 2 - buttonType.lineHeight / 2 + baselineOffset(buttonType));

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.colors.surfacePage,
  },
  form: { paddingBottom: ACTIONS.gapAbove },
  progress: {
    marginTop: ONB.progressTop,
    marginHorizontal: ONB.progressInset,
  },
  wordmark: {
    marginTop: wordmarkTop - progressBottom,
    marginLeft: ONB.labelX - 1.04,
    height: WORDMARK_LINE.height,
  },
  title: {
    ...rn(questionType),
    color: tokens.colors.textPrimary,
    marginTop: after(wordmarkBottom, ONB.questionBaseline, questionType),
    marginLeft: 17.9,
    marginRight: ONB.cardRight,
  },
  body: {
    ...rn(subType),
    color: tokens.colors.textSecondary,
    marginTop: after(questionBottom, ONB.subBaseline, subType),
    marginLeft: 18.36,
    marginRight: 15,
  },
  label: { ...rn(labelType), color: tokens.colors.textPrimary, marginLeft: ONB.labelX, marginRight: ONB.cardRight },
  labelAirport: { marginTop: after(subBottom, ONB.airportLabel, labelType) },
  airport: {
    marginTop: ONB.airportTop - labelBottom(ONB.airportLabel),
    marginLeft: ONB.cardLeft,
    marginRight: ONB.cardRight,
    gap: tokens.space.xs,
  },
  labelCabin: { marginTop: after(ONB.airportTop + HOME_CARD.height, ONB.cabinLabel, labelType) },
  cabins: {
    flexDirection: "row",
    gap: ONB.cabinGap,
    marginTop: ONB.cabinTop - labelBottom(ONB.cabinLabel),
    marginLeft: ONB.cardLeft,
    marginRight: 16.1,
  },
  labelTravelers: { marginTop: after(ONB.cabinTop + ONB.cabinsHeight, ONB.travelersLabel, labelType) },
  travelers: {
    marginTop: ONB.travelersTop - labelBottom(ONB.travelersLabel),
    marginLeft: 18.2,
    marginRight: 17.3,
  },
  family: {
    marginTop: ONB.familyTop - (ONB.travelersTop + ONB.travelersHeight),
    marginLeft: 17.5,
    marginRight: 16.6,
  },
  fieldLabel: {
    ...rn(fieldLabelType),
    color: tokens.colors.textSecondary,
    marginTop: after(subBottom, SEARCH.labelBaseline, fieldLabelType),
    marginLeft: 18.9,
  },
  field: {
    marginTop: SEARCH.fieldTop - (SEARCH.labelBaseline + belowBaseline(fieldLabelType)),
    marginLeft: 18.4,
    marginRight: 19,
  },
  helper: {
    ...rn(helperType),
    color: tokens.colors.textSecondary,
    marginTop: after(SEARCH.fieldTop + SEARCH.fieldHeight, SEARCH.helperBaseline, helperType),
    marginLeft: 18.9,
    marginRight: 16.8,
  },
  rows: {
    gap: 8.7,
    marginTop: SEARCH.rowsTop - (SEARCH.helperBaseline + belowBaseline(helperType)),
    marginLeft: 17.8,
    marginRight: 16.8,
  },
  message: {
    marginTop: SEARCH.emptyTop - (SEARCH.helperBaseline + belowBaseline(helperType)),
    marginHorizontal: 18,
  },
  actions: { paddingTop: 0 },
  continue: { marginLeft: ONB.cardLeft, marginRight: 16.4, paddingTop: 2 * LABEL_DROP },
  skip: {
    alignItems: "center",
    marginTop: ACTIONS.skipBelowButton - baselineOffset(skipType),
  },
});
