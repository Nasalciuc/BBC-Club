import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Chip, EmptyState, ErrorState, EstimateRow, FARE_ROW_HEIGHT, FareRow, tokens, rn } from "@bbc/ui";

import { fareHref } from "@/features/explore/open-offer";
import type { SearchState } from "@/features/search/useSearch";
import { formatPrice } from "@/lib/format";

import { SectionLabelWithLocalTime } from "./LocalTime";
import {
  cabinLabel,
  datesChipLabel,
  faresLabel,
  noFareCopy,
  preferencesLines,
  travelersLabel,
} from "./travel-preferences";

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

/** Figma 481:9097 sets the message on two lines, broken after `for a` (copy for Betty to confirm). */
const PAUSED = "Searching paused for a\nmoment. Try again shortly.";

/**
 * The sheet once a destination is chosen (Figma 89:387, 481:9097, 536:10635, 536:10864) and its empty states
 * (89:390, 89:391, 536:11155). The `Request a quote` pill is the sheet's footer, docked by Explore.
 *
 * Figma's rhythm: the chips 12 pt under the field, then 4 pt, the 32-pt box of the fare count (or of the paused
 * message, 481:9097), 4 pt, the fare rows 8 pt apart. The empty states set the preferences in mono 16 pt under the
 * field and their message at 344 on the frame — 94 pt under the preferences.
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
          <Chip testID="explore.chip.dates" label={datesChipLabel(state.dates)} fill="content" onPress={onEditDates} />
          <Chip testID="explore.chip.cabin" label={cabinLabel(state.cabin)} fill="content" onPress={onEditCabin} />
          <Chip
            testID="explore.chip.travelers"
            label={travelersLabel(state.passengers)}
            fill="content"
            onPress={onEditTravelers}
          />
        </View>
      )}

      {offline ? (
        // Figma 89:391: `Try again` is the screen's one filled button (Tone Primary).
        <View style={styles.message}>
          <ErrorState
            variant="offline"
            testID="explore.offline"
            title="You’re offline."
            body="You can still request a fare — it goes out as soon as you’re back online."
            primary={{ label: "Try again", onPress: onRetry, testID: "explore.offline.retry" }}
          />
        </View>
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
          <View style={styles.countBox}>
            {state.status === "paused" ? (
              <Text testID="search.paused" style={styles.paused}>
                {PAUSED}
              </Text>
            ) : (
              <SectionLabelWithLocalTime label={faresLabel(state.results.length)} city={city} tz={tz} />
            )}
          </View>
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
          <View style={styles.countBox}>
            <SectionLabelWithLocalTime label="Indicative fare" city={city} tz={tz} />
          </View>
          <EstimateRow
            testID="explore.estimate"
            amount={formatPrice(state.estimate.amount, state.estimate.currency)}
            onPress={onQuote}
          />
        </>
      ) : null}

      {!offline && state.status === "empty" && !state.estimate ? (
        <View style={styles.message}>
          <EmptyState
            testID="explore.empty"
            title={noFareCopy(state.route?.from ?? state.from, to).title}
            body={noFareCopy(state.route?.from ?? state.from, to).body}
            primary={{ label: "Request a quote", onPress: onQuote }}
          />
        </View>
      ) : null}

      {!offline && state.status === "paused" && !state.results ? (
        <View style={styles.countBox}>
          <Text testID="search.paused" style={styles.paused}>
            {PAUSED}
          </Text>
        </View>
      ) : null}

      {!offline && state.status === "error" && state.errorMessage ? (
        <View style={styles.message}>
          <ErrorState
            variant="error"
            title="Something went wrong."
            body={state.errorMessage}
            primary={{ label: "Try again", onPress: onRetry }}
            testID="explore.searchError"
          />
        </View>
      ) : null}
    </>
  );
}

/** Figma 89:387: 4 pt, the count's 32-pt box, 4 pt — where the fare rows start. */
const COUNT_BOX = 32;

const styles = StyleSheet.create({
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: tokens.space.xs,
    marginTop: tokens.space.sm,
  },
  countBox: { minHeight: COUNT_BOX, justifyContent: "center", marginVertical: tokens.space.xxs },
  // 100:712: one mono text of two lines, 17 pt apart — no gap between them.
  prefs: { marginTop: tokens.space.md },
  prefsText: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  // 89:390: the message's top at 344 on the frame, 94 pt under the preferences' last line.
  message: { marginTop: 94 },
  // The placeholders take the rows' own size and spacing, so the fares land where the skeleton stood.
  skeletons: { marginTop: tokens.space.xxs + COUNT_BOX + tokens.space.xxs, gap: tokens.space.xs },
  skeletonRow: {
    height: FARE_ROW_HEIGHT,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.borderDefault,
  },
  // 481:9097: the caption in the count's box — two lines, which stand 2 pt over the box at each edge.
  paused: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary, marginVertical: -2 },
});
