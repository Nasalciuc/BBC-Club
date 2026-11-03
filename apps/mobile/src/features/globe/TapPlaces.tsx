import { StyleSheet, View } from "react-native";
import { AirportRow, SectionHeader, tokens } from "@bbc/ui";
import type { NearAirportVM } from "@bbc/shared/api/v1/fares";

import { airportName } from "@/features/explore/discovery-logic";

import type { TapChoices } from "./places-near-logic";

type Props = {
  choices: TapChoices;
  onChoose: (airport: NearAirportVM) => void;
};

/**
 * Where a tap on the globe fell (ADR-IMPL-083): the town over the airports nearest it, each a white row as Search's
 * (18) with how far it is; a row opens its airport as a pin's tap does. No image draws it — proposed until design does:
 * Search's own section title and rows, under the search bar where ADR-IMPL-068's answers stand. Read out as it appears.
 * GeoNames' credit for the town's name is in Settings, not here (ADR-IMPL-086).
 */
export function TapPlaces({ choices, onChoose }: Props) {
  return (
    <View testID="explore.tap.places" style={styles.wrap} accessibilityLiveRegion="polite">
      <SectionHeader title={choices.title} size="titleSm" testID="explore.tap.title" />
      <View style={styles.rows}>
        {choices.airports.map((a) => (
          <AirportRow
            key={a.code}
            testID={`explore.tap.airport.${a.code}`}
            code={a.code}
            city={a.city}
            airport={airportName(a)}
            distance={a.distance}
            onPress={() => onChoose(a)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: tokens.space.sm },
  rows: { gap: tokens.space.xs },
});
