import { useRouter, type Href } from "expo-router";
import type { Dispatch } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Chip, EmptyState, ErrorState, FareRow, SectionLabel, tokens, rn } from "@bbc/ui";

import type { SearchAction, SearchState } from "@/features/search/useSearch";

function fareHref(id: string, offerId?: string | null): Href {
  return {
    pathname: "/fare/[id]",
    params: offerId ? { id, offerId } : { id },
  } as unknown as Href;
}

type Props = {
  state: SearchState;
  dispatch: Dispatch<SearchAction>;
  onRetry: () => void;
};

export function SheetSelected({ state, dispatch, onRetry }: Props) {
  const router = useRouter();

  return (
    <>
      <View style={styles.chips}>
        <Chip
          testID="explore.chip.dates"
          label={state.dates.depart ? state.dates.depart : "Dates"}
          icon="dates"
          selected={!!state.dates.depart}
          onPress={() =>
            dispatch({
              type: "setDates",
              dates: { depart: "2026-10-12", return: "2026-10-19", flexible: false },
            })
          }
        />
        <Chip
          testID="explore.chip.cabin"
          label={state.cabin === "business" ? "Business" : "First"}
          icon="cabin"
          selected
          onPress={() => dispatch({ type: "setCabin", cabin: state.cabin === "business" ? "first" : "business" })}
        />
        <Chip
          testID="explore.chip.travelers"
          label={`${state.passengers.adult} adult`}
          icon="passengers"
          selected={state.passengers.adult > 1}
          onPress={() =>
            dispatch({
              type: "setPassengers",
              passengers: { ...state.passengers, adult: state.passengers.adult === 1 ? 2 : 1 },
            })
          }
        />
      </View>

      {state.status === "searching" ? (
        <View style={styles.skeletons}>
          <View style={styles.skeletonRow} />
          <View style={styles.skeletonRow} />
          <View style={styles.skeletonRow} />
        </View>
      ) : null}

      {state.status === "done" && state.results ? (
        <>
          <SectionLabel label={`${state.results.length} fares · lowest first`} />
          {state.results.map((fare) => (
            <FareRow
              key={fare.id}
              testID={`explore.fare.${fare.id}`}
              fare={fare}
              onPress={() => router.push(fareHref(fare.id, fare.offerId))}
            />
          ))}
          <Pressable
            testID="explore.quote"
            accessibilityRole="button"
            accessibilityLabel="Request a quote"
            onPress={() => router.push(fareHref("00000000-0000-4000-8000-00000000fa01"))}
            style={({ pressed }) => [styles.quote, pressed && styles.pressed]}
          >
            <Text style={styles.quoteText}>Nothing that fits? Request a quote →</Text>
          </Pressable>
        </>
      ) : null}

      {state.status === "empty" ? (
        <EmptyState
          testID="explore.empty"
          title={`We don't publish fares for ${state.from?.code ?? "JFK"} → ${state.to!.code}.`}
          body="We find them. Tell us your dates and a specialist calls you with options — usually 30–50 % under the published fare."
          primary={{
            label: "Request a quote",
            onPress: () => router.push(fareHref("00000000-0000-4000-8000-00000000fa01")),
          }}
        />
      ) : null}

      {state.status === "error" && state.errorMessage ? (
        <ErrorState
          variant="error"
          title="Something went wrong."
          body={state.errorMessage}
          primary={{ label: "Try again", onPress: onRetry }}
          testID="explore.searchError"
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: tokens.space.xs,
    marginTop: tokens.space.sm,
  },
  skeletons: { marginTop: tokens.space.md, gap: tokens.space.md },
  skeletonRow: {
    height: 80,
    borderRadius: tokens.radius.card,
    backgroundColor: tokens.colors.borderDefault,
  },
  quote: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.card,
    padding: tokens.space.md,
    marginTop: tokens.space.sm,
  },
  quoteText: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  pressed: { opacity: 0.85 },
});
