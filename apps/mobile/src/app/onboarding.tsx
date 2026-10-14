import { useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AirportRow,
  Button,
  Chip,
  EmptyState,
  ProgressLine,
  SearchField,
  StateMessage,
  Stepper,
  tokens,
  rn,
} from "@bbc/ui";
import type { AirportVM } from "@bbc/shared/api/v1/fares";

import { deviceTimeZone } from "@/features/explore/discovery-logic";
import { airportSearchState, chosenAirportLabel, wantsAirportSearch } from "@/lib/airport-search-state";
import { fetchAirports, fetchHomeSuggestion, patchProfile, putTravelPreferences } from "@/lib/api";
import { stateCopy } from "@/lib/error-context";
import { appStorage, ONBOARDED_KEY } from "@/lib/storage-keys";

const EXPLORE = "/(tabs)/explore" as Href;

function markOnboarded() {
  appStorage.set(ONBOARDED_KEY, true);
}

/**
 * Figma 63:7 and 72:222: two steps on one screen — the form (the home airport, the cabin, who usually travels) and,
 * from its airport field, the airport search. The search step keeps the time zone's suggestion (A5, 536:11191).
 */
export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<"form" | "airport">("form");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AirportVM | null>(null);
  const [search, setSearch] = useState(() => airportSearchState<AirportVM>("idle"));
  const [cabin, setCabin] = useState<"business" | "first">("business");
  const [adult, setAdult] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ADR-IMPL-039 / Figma 536:11191: the busiest airport in the phone's time zone, offered — never chosen — for the member.
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
  }, [query, selected]);

  async function onContinue() {
    if (!selected) {
      setError("Pick an airport or enter a 3-letter code.");
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

  function choose(airport: AirportVM) {
    // The choice ends the typing: the keyboard goes, and the form shows the airport in its field.
    Keyboard.dismiss();
    setSelected(airport);
    setQuery("");
    setSearch(airportSearchState("idle"));
    setStep("form");
  }

  // Figma draws the actions 40 pt above the frame's bottom (the form) and 48 (the search): the home indicator's 34
  // and 6 or 14 more — never closer than 16 to the edge on a phone without one.
  const footerBottom = (above: number) => Math.max(insets.bottom + above, tokens.space.md);

  if (step === "airport") {
    const typing = query.trim().length >= 2;
    return (
      <View style={[styles.root, { paddingTop: insets.top + TOP }]} testID="onboarding.root">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              Where do you fly from?
            </Text>
            <Text style={styles.body}>
              {suggested ? "City, airport or code — suggested from your time zone." : "City, airport or code."}
            </Text>
          </View>

          {/* Figma 72:222 draws no Clear in this field: `Clear search` comes with No airports found (75:269). */}
          <SearchField
            testID="onboarding.airport.query"
            placeholder="City or airport code"
            editable
            autoFocus
            value={query ? { text: query } : null}
            onChangeText={setQuery}
          />

          {suggested && !typing ? (
            <AirportRow
              testID={`onboarding.airport.suggested.${suggested.code}`}
              code={suggested.code}
              city={suggested.city}
              airport={suggested.name}
              onPress={() => choose(suggested)}
            />
          ) : search.phase === "empty" ? (
            <EmptyState
              testID="onboarding.airport.empty"
              title="No airports found"
              body="Try a city name or a three-letter airport code, such as JFK."
              primary={{ label: "Clear search", onPress: () => setQuery("") }}
            />
          ) : search.phase === "error" ? (
            <StateMessage
              testID="onboarding.airport.error"
              variant="error"
              title={stateCopy("generic").title}
              body={stateCopy("generic").body}
              primary={{
                label: "Try again",
                onPress: () => {
                  const q = query;
                  setSearch(airportSearchState("loading"));
                  void (async () => {
                    const result = await fetchAirports(q);
                    setSearch(airportSearchState(result));
                  })();
                },
              }}
            />
          ) : search.airports.length > 0 ? (
            <View style={styles.rows}>
              {search.airports.map((a) => (
                <AirportRow
                  key={a.code}
                  testID={`onboarding.airport.hit.${a.code}`}
                  code={a.code}
                  city={a.city}
                  airport={a.name}
                  onPress={() => choose(a)}
                />
              ))}
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.actions, { paddingBottom: footerBottom(14) }]}>
          <TextButton
            testID="onboarding.airport.cancel"
            label="Cancel"
            onPress={() => {
              Keyboard.dismiss();
              setStep("form");
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + LINE_TOP }]} testID="onboarding.root">
      <ProgressLine fraction={1} />
      <ScrollView contentContainerStyle={[styles.content, styles.formContent]} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Where do you usually fly from?
          </Text>
          <Text style={styles.body}>So we start with the right fares. You can change this later.</Text>
        </View>

        <View style={styles.group}>
          <Text style={styles.label}>Home airport</Text>
          <SearchField
            testID="onboarding.airport"
            placeholder="City or airport code"
            value={selected ? { text: chosenAirportLabel(selected) } : null}
            error={Boolean(error) && !selected}
            onPress={openAirportStep}
          />
          {error ? (
            <Text testID="onboarding.error" style={styles.error}>
              {error}
            </Text>
          ) : null}
        </View>

        <View style={styles.group}>
          <Text style={styles.label}>Cabin</Text>
          <View style={styles.chips}>
            <Chip
              testID="onboarding.cabin.business"
              label="Business"
              selected={cabin === "business"}
              fill="equal"
              onPress={() => setCabin("business")}
            />
            <Chip
              testID="onboarding.cabin.first"
              label="First"
              selected={cabin === "first"}
              fill="equal"
              onPress={() => setCabin("first")}
            />
          </View>
        </View>

        <View style={styles.group}>
          <Text style={styles.label}>Who usually travels</Text>
          <Stepper
            testID="onboarding.travelers.adult"
            label="Adults"
            value={adult}
            min={1}
            max={9}
            onChange={setAdult}
          />
          <Text style={styles.caption}>Travelling with children? Add their ages in a note when you request.</Text>
        </View>
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: footerBottom(6) }]}>
        <Button
          testID="onboarding.continue"
          label={busy ? "Saving…" : "Continue"}
          busy={busy}
          variant="primary"
          onPress={() => void onContinue()}
        />
        <TextButton testID="onboarding.skip" label="Skip" disabled={busy} onPress={onSkip} />
      </View>
    </View>
  );
}

/** Figma's quiet action under the button (Skip, Cancel): the button's words alone, 56 pt high, centred. */
function TextButton({
  testID,
  label,
  disabled = false,
  onPress,
}: {
  testID: string;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
    >
      <Text style={styles.textButtonLabel}>{label}</Text>
    </Pressable>
  );
}

/**
 * Figma 63:7: the progress line 14 pt under the status bar (62 on the frame), 2 pt high, the content 16 pt under it (80).
 * The search step (72:222) has no line; its title starts at the same place.
 */
const LINE_TOP = 14;
const TOP = LINE_TOP + 2 + tokens.space.md;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.colors.surfacePage,
    paddingHorizontal: tokens.space.lg,
  },
  content: {
    gap: tokens.space.lg,
    paddingBottom: tokens.space.lg,
  },
  formContent: {
    paddingTop: tokens.space.md,
  },
  header: {
    gap: tokens.space.sm,
  },
  title: {
    ...rn(tokens.type.headline),
    color: tokens.colors.textPrimary,
  },
  body: {
    ...rn(tokens.type.bodySm),
    color: tokens.colors.textSecondary,
  },
  // Figma 69:42: a field group — its label 8 pt over the control.
  group: {
    gap: tokens.space.xs,
  },
  label: {
    ...rn(tokens.type.caption),
    color: tokens.colors.textSecondary,
  },
  // Figma 69:50: two 164-pt cabins, 16 pt apart.
  chips: {
    flexDirection: "row",
    gap: tokens.space.md,
  },
  // Figma 72:222: the airport rows stand 8 pt apart.
  rows: {
    gap: tokens.space.xs,
  },
  caption: {
    ...rn(tokens.type.caption),
    color: tokens.colors.textSecondary,
  },
  error: {
    ...rn(tokens.type.caption),
    color: tokens.colors.statusDanger,
  },
  // Figma 69:77: the actions 8 pt apart, pinned at the bottom.
  actions: {
    gap: tokens.space.xs,
    paddingTop: tokens.space.md,
  },
  textButton: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.6,
  },
  textButtonLabel: {
    ...rn(tokens.type.button),
    color: tokens.colors.textPrimary,
  },
});
