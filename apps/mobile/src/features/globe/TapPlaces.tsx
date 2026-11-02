import { Linking, StyleSheet, View } from "react-native";
import { AirportRow, PhotoCredit, SectionHeader, tokens } from "@bbc/ui";
import type { NearAirportVM } from "@bbc/shared/api/v1/fares";

import { airportName } from "@/features/explore/discovery-logic";

import type { TapChoices } from "./places-near-logic";

/** GeoNames' licence asks for its credit where a place's name comes from it (seeds/NOTICE.md). */
const GEONAMES = { label: "Place names: GeoNames · CC BY 4.0", url: "https://www.geonames.org/" } as const;

type Props = {
  choices: TapChoices;
  /** True when the title names a town (GeoNames' data): its credit follows the airports. */
  named: boolean;
  onChoose: (airport: NearAirportVM) => void;
};

/**
 * Where a tap on the globe fell (ADR-IMPL-083): the town over the airports nearest it, each a white row as Search's
 * (18) with how far it is; a row opens its airport as a pin's tap does. No image draws it — proposed until design does:
 * Search's own section title and rows, under the search bar where ADR-IMPL-068's answers stand. Read out as it appears.
 */
export function TapPlaces({ choices, named, onChoose }: Props) {
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
      {named ? (
        <PhotoCredit
          testID="explore.tap.credit"
          label={GEONAMES.label}
          accessibilityLabel="Place names from GeoNames, CC BY 4.0"
          onPress={() => {
            Linking.openURL(GEONAMES.url).catch(() => undefined);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: tokens.space.sm },
  rows: { gap: tokens.space.xs },
});
