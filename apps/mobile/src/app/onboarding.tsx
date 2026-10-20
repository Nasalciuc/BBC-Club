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
  ProgressLine,
  SearchField,
  SectionHeader,
  StateMessage,
  Stepper,
  TextButton,
  Wordmark,
  rn,
  tokens,
} from "@bbc/ui";
import type { AirportVM } from "@bbc/shared/api/v1/fares";

import { ScreenStatusBar } from "@/components/screen-status-bar";
import { deviceTimeZone } from "@/features/explore/discovery-logic";
import { HomeAirportCard } from "@/features/onboarding/HomeAirportCard";
import { airportSearchState, wantsAirportSearch } from "@/lib/airport-search-state";
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
        if (!cancelled) setSearch(airportSearchState(result));
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
    <View style={styles.header}>
      <ProgressLine fraction={answered / 3} />
      <View style={styles.wordmark}>
        <Wordmark />
      </View>
      <View style={styles.question}>
        {/* 01 breaks the question after `usually`. */}
        <Text style={styles.title} accessibilityRole="header">
          {"Where do you usually\nfly from?"}
        </Text>
        <Text style={styles.body}>So we start with the right fares. You can change this later.</Text>
      </View>
    </View>
  );

  if (step === "airport") {
    const typing = query.trim().length >= 2;
    return (
      <View style={[styles.root, { paddingTop: insets.top + tokens.space.md }]} testID="onboarding.root">
        <ScreenStatusBar on="light" />
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + tokens.space.lg }]}
          keyboardShouldPersistTaps="handled"
        >
          {header}
          <View style={styles.group}>
            <Text style={styles.label}>City or airport code</Text>
            <SearchField
              testID="onboarding.airport.query"
              placeholder="City or airport code"
              editable
              autoFocus
              tone="field"
              value={query ? { text: query } : null}
              onChangeText={setQuery}
              onClear={() => setQuery("")}
              onCancel={closeAirportStep}
            />
            <Text style={styles.helper}>
              {suggested ? "City, airport or code — suggested from your time zone." : "City, airport or code."}
            </Text>
          </View>

          {suggested && !typing ? (
            <AirportRow
              testID={`onboarding.airport.suggested.${suggested.code}`}
              layout="code"
              code={suggested.code}
              city={suggested.city}
              airport={suggested.name}
              onPress={() => choose(suggested)}
            />
          ) : search.phase === "empty" ? (
            <View style={styles.message}>
              <EmptyState
                testID="onboarding.airport.empty"
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
                  city={a.city}
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
    <View style={[styles.root, { paddingTop: insets.top + tokens.space.md }]} testID="onboarding.root">
      <ScreenStatusBar on="light" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {header}

        <View style={styles.group}>
          <SectionHeader title="Your home airport" size="subtitle" />
          <HomeAirportCard
            testID="onboarding.airport"
            airport={selected}
            error={Boolean(error) && !selected}
            onPress={openAirportStep}
          />
          {error ? <FieldError testID="onboarding.error">{error}</FieldError> : null}
        </View>

        <View style={styles.group}>
          <SectionHeader title="Preferred cabin" size="subtitle" />
          <View style={styles.cabins}>
            <CabinCard
              testID="onboarding.cabin.business"
              icon="seat"
              title="Business"
              line="More space, a better journey"
              selected={cabin === "business"}
              onPress={() => {
                setCabin("business");
                setCabinTouched(true);
              }}
            />
            <CabinCard
              testID="onboarding.cabin.first"
              icon="armchair"
              title="First"
              line="The highest level of comfort"
              selected={cabin === "first"}
              onPress={() => {
                setCabin("first");
                setCabinTouched(true);
              }}
            />
          </View>
        </View>

        <View style={styles.group}>
          <SectionHeader title="Who usually travels" size="subtitle" />
          <Stepper
            testID="onboarding.travelers.adult"
            icon="user"
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
          <InfoCard
            testID="onboarding.children"
            icon="family"
            iconStyle="bare"
            title="Travelling with children?"
            body="Add their ages in a note when you request."
          />
        </View>
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, tokens.space.md) }]}>
        <Button
          testID="onboarding.continue"
          label={busy ? "Saving…" : "Continue"}
          trailing={busy ? undefined : "arrow"}
          busy={busy}
          variant="primary"
          onPress={() => void onContinue()}
        />
        <TextButton
          testID="onboarding.skip"
          label="Skip"
          tone="secondary"
          size="button"
          disabled={busy}
          onPress={onSkip}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.colors.surfacePage,
  },
  content: {
    paddingHorizontal: tokens.space.gutter,
    paddingBottom: tokens.space.lg,
    gap: tokens.space.md,
  },
  // 01: the line, 12 pt, the wordmark, 12 pt, the question and its words under it.
  header: { gap: tokens.space.sm },
  wordmark: { marginBottom: tokens.space.xxs },
  question: { gap: tokens.space.xs },
  title: { ...rn(tokens.type.headline), color: tokens.colors.textPrimary },
  body: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  group: { gap: 10 },
  label: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  helper: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  cabins: { flexDirection: "row", gap: tokens.space.xs },
  rows: { gap: tokens.space.xs },
  message: { marginTop: tokens.space.lg },
  actions: {
    paddingHorizontal: tokens.space.gutter,
    paddingTop: tokens.space.sm,
    gap: tokens.space.xxs,
    alignItems: "stretch",
  },
});
