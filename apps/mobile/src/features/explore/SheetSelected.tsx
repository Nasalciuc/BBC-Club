import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Chip, EmptyState, ErrorState, EstimateRow, FareRow, tokens, rn } from "@bbc/ui";

import { fareHref } from "@/features/explore/open-offer";
import type { SearchState } from "@/features/search/useSearch";
import { formatPrice } from "@/lib/format";

import { SectionLabelWithLocalTime } from "./LocalTime";
import { cabinLabel, datesChipLabel, noFareCopy, preferencesLines, travelersLabel } from "./travel-preferences";

type Props = {
  state: SearchState;
  /** Explore passes this only when the route has nothing on screen: fares already shown stay through a blip. */
  offline: boolean;
  onRetry: () => void;
  onQuote: () => void;
  onEditDates: () => void;
  onEditCabin: () => void;
  onEditTravelers: () => void;
};

/**
 * The sheet once a destination is chosen (Figma 89:387, 481:9097, 536:10635, 536:10864) and its empty states
 * (89:390, 89:391, 536:11155). The `Request a quote` pill is the sheet's footer, docked by Explore.
 */
export function SheetSelected({ state, offline, onRetry, onQuote, onEditDates, onEditCabin, onEditTravelers }: Props) {
  const router = useRouter();
  const to = state.route?.to ?? state.to;
  const city = to?.city ?? "";
  const tz = state.route?.to.tz;

  // Figma 89:390 / 89:391 / 536:11155: the empty states summarise the preferences in mono instead of chips.
  const emptyLike = offline || ((state.status === "empty" || state.status === "error") && !state.estimate);
  const [prefsLine1, prefsLine2] = preferencesLines(state.dates, state.cabin, state.passengers);

  return (
    <>
      {emptyLike ? (
        <View style={styles.prefs} testID="explore.preferences">
          <Text style={styles.prefsText}>{prefsLine1}</Text>
          <Text style={styles.prefsText}>{prefsLine2}</Text>
        </View>
      ) : (
        <View style={styles.chips} testID="explore.chips">
          <Chip testID="explore.chip.dates" label={datesChipLabel(state.dates)} onPress={onEditDates} />
          <Chip testID="explore.chip.cabin" label={cabinLabel(state.cabin)} onPress={onEditCabin} />
          <Chip testID="explore.chip.travelers" label={travelersLabel(state.passengers)} onPress={onEditTravelers} />
        </View>
      )}

      {offline ? (
        // Figma 89:391: `Try again` is the screen's one filled button (Tone Primary).
        <ErrorState
          variant="offline"
          testID="explore.offline"
          title="You’re offline."
          body="You can still request a fare — it goes out as soon as you’re back online."
          primary={{ label: "Try again", onPress: onRetry, testID: "explore.offline.retry" }}
        />
      ) : null}

      {!offline && state.status === "searching" ? (
        <View style={styles.skeletons}>
          <View style={styles.skeletonRow} />
          <View style={styles.skeletonRow} />
          <View style={styles.skeletonRow} />
        </View>
      ) : null}

      {!offline && (state.status === "done" || state.status === "paused") && state.results ? (
        <>
          {state.status === "paused" ? (
            <Text testID="search.paused" style={styles.paused}>
              Searching paused for a moment. Try again shortly.
            </Text>
          ) : (
            <SectionLabelWithLocalTime label={`${state.results.length} fares · lowest first`} city={city} tz={tz} />
          )}
          {state.results.map((fare) => (
            <FareRow
              key={fare.id}
              testID={`explore.fare.${fare.id}`}
              fare={fare}
              onPress={() => router.push(fareHref(fare.id, fare.offerId))}
            />
          ))}
        </>
      ) : null}

      {!offline && state.status === "empty" && state.estimate ? (
        // Figma 536:10635: the indicative fare where the list would be; the footer asks for the quote.
        <>
          <SectionLabelWithLocalTime label="Indicative fare" city={city} tz={tz} />
          <EstimateRow
            testID="explore.estimate"
            amount={formatPrice(state.estimate.amount, state.estimate.currency)}
            onPress={onQuote}
          />
        </>
      ) : null}

      {!offline && state.status === "empty" && !state.estimate ? (
        <EmptyState
          testID="explore.empty"
          title={noFareCopy(state.route?.from ?? state.from, to).title}
          body={noFareCopy(state.route?.from ?? state.from, to).body}
          primary={{ label: "Request a quote", onPress: onQuote }}
        />
      ) : null}

      {!offline && state.status === "paused" && !state.results ? (
        <Text testID="search.paused" style={styles.paused}>
          Searching paused for a moment. Try again shortly.
        </Text>
      ) : null}

      {!offline && state.status === "error" && state.errorMessage ? (
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

/** Whether Explore docks the `Request a quote` footer: results or an estimate, never beside an EmptyState's own pill. */
export function wantsQuoteFooter(state: SearchState, offline: boolean): boolean {
  if (offline) return false;
  if (state.status === "done" || state.status === "paused") return state.results !== null;
  return state.status === "empty" && state.estimate !== null;
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: tokens.space.xs,
    marginTop: tokens.space.sm,
  },
  prefs: { marginTop: tokens.space.md, gap: tokens.space.xxs },
  prefsText: { ...rn(tokens.type.factsMono), color: tokens.colors.textSecondary },
  skeletons: { marginTop: tokens.space.md, gap: tokens.space.md },
  skeletonRow: {
    height: 80,
    borderRadius: tokens.radius.card,
    backgroundColor: tokens.colors.borderDefault,
  },
  paused: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary, marginTop: tokens.space.md },
});
