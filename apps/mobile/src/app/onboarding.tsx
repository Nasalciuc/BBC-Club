import { useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AirportRow, Button, Chip, EmptyState, ProgressLine, SearchField, Stepper, tokens, rn } from "@bbc/ui";
import type { AirportVM } from "@bbc/shared/api/v1/fares";

import { fetchAirports, patchProfile, putTravelPreferences } from "@/lib/api";
import { appStorage, ONBOARDED_KEY } from "@/lib/storage-keys";

const EXPLORE = "/(tabs)/explore" as Href;

function markOnboarded() {
  appStorage.set(ONBOARDED_KEY, true);
}

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AirportVM | null>(null);
  const [hits, setHits] = useState<AirportVM[]>([]);
  const [searched, setSearched] = useState(false);
  const [cabin, setCabin] = useState<"business" | "first">("business");
  const [adult, setAdult] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      setSearched(false);
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        const result = await fetchAirports(query);
        if (result.ok) setHits(result.data);
        else setHits([]);
        setSearched(true);
      })();
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  async function onContinue() {
    const code = (selected?.code ?? query.trim().toUpperCase()).slice(0, 3);
    if (code.length !== 3) {
      setError("Pick an airport or enter a 3-letter code.");
      return;
    }

    setBusy(true);
    setError(null);

    const airportResult = await patchProfile({ homeAirport: code });
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

  return (
    <View style={[styles.root, { paddingTop: insets.top + tokens.space.md }]} testID="onboarding.root">
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + tokens.space.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <ProgressLine fraction={1} />
          <Text style={styles.title}>Where do you fly from?</Text>
          <Text style={styles.body}>City, airport or code.</Text>
        </View>

        <Text style={styles.section}>Home airport</Text>
        <SearchField
          testID="onboarding.airport.query"
          placeholder="City or code"
          editable
          value={query ? { text: query } : null}
          onChangeText={(text) => {
            setQuery(text);
            setSelected(null);
            setError(null);
          }}
          onClear={() => {
            setQuery("");
            setSelected(null);
          }}
        />

        {searched && query.trim().length >= 2 && hits.length === 0 && !selected ? (
          <EmptyState
            testID="onboarding.airport.empty"
            title="No airports found"
            body="Try a city name or a three-letter airport code, such as JFK."
            primary={{
              label: "Clear search",
              onPress: () => {
                setQuery("");
                setSelected(null);
                setSearched(false);
              },
            }}
          />
        ) : (
          hits.map((a) => (
            <AirportRow
              key={a.code}
              testID={`onboarding.airport.hit.${a.code}`}
              code={a.code}
              city={a.city}
              airport={a.name}
              countryCode={a.countryCode}
              onPress={() => {
                setSelected(a);
                setQuery(`${a.city} · ${a.code}`);
                setHits([]);
                setSearched(false);
              }}
            />
          ))
        )}

        <Text style={styles.section}>Cabin</Text>
        <View style={styles.chips}>
          <Chip
            testID="onboarding.cabin.business"
            label="Business"
            selected={cabin === "business"}
            onPress={() => setCabin("business")}
          />
          <Chip
            testID="onboarding.cabin.first"
            label="First"
            selected={cabin === "first"}
            onPress={() => setCabin("first")}
          />
        </View>

        <Text style={styles.section}>Who usually travels</Text>
        <Stepper testID="onboarding.travelers.adult" label="Adults" value={adult} min={1} max={9} onChange={setAdult} />
        <Text style={styles.caption}>Travelling with children? Add their ages in a note when you request.</Text>

        {error ? (
          <Text testID="onboarding.error" style={styles.error}>
            {error}
          </Text>
        ) : null}

        <Button
          testID="onboarding.continue"
          label={busy ? "Saving…" : "Continue"}
          busy={busy}
          shape="pill"
          variant="primary"
          onPress={() => void onContinue()}
        />

        <Pressable
          testID="onboarding.skip"
          accessibilityRole="button"
          accessibilityLabel="Skip"
          disabled={busy}
          onPress={onSkip}
          style={styles.skip}
        >
          <Text style={styles.skipLabel}>Skip</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.colors.surfacePage,
  },
  content: {
    paddingHorizontal: tokens.space.lg,
    gap: tokens.space.sm,
  },
  header: {
    marginBottom: tokens.space.md,
    gap: tokens.space.xs,
  },
  title: {
    ...rn(tokens.type.headline),
    color: tokens.colors.textPrimary,
  },
  body: {
    ...rn(tokens.type.bodySm),
    color: tokens.colors.textSecondary,
  },
  section: {
    ...rn(tokens.type.caption),
    color: tokens.colors.textSecondary,
    marginTop: tokens.space.md,
  },
  chips: {
    flexDirection: "row",
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
  skip: {
    alignItems: "center",
    paddingVertical: tokens.space.md,
    minHeight: 44,
    justifyContent: "center",
  },
  skipLabel: {
    ...rn(tokens.type.body),
    color: tokens.colors.textSecondary,
  },
});
