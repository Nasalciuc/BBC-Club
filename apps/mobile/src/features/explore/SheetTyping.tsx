import { useEffect, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import type { AirportVM } from "@bbc/shared/api/v1/fares";
import { AirportRow, tokens, rn } from "@bbc/ui";

import { fetchAirports } from "@/lib/api";

type Props = {
  onSelect: (airport: AirportVM) => void;
};

export function SheetTyping({ onSelect }: Props) {
  const [airportQuery, setAirportQuery] = useState("");
  const [airportHits, setAirportHits] = useState<AirportVM[]>([]);

  useEffect(() => {
    if (airportQuery.trim().length < 2) {
      setAirportHits([]);
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        const result = await fetchAirports(airportQuery);
        if (result.ok) setAirportHits(result.data);
      })();
    }, 200);
    return () => clearTimeout(t);
  }, [airportQuery]);

  return (
    <View style={styles.airportPicker}>
      <TextInput
        testID="explore.airportQuery"
        value={airportQuery}
        onChangeText={setAirportQuery}
        placeholder="City or code"
        placeholderTextColor={tokens.colors.textTertiary}
        style={styles.airportInput}
        autoFocus
      />
      {airportHits.map((a) => (
        <AirportRow
          key={a.code}
          testID={`explore.airport.${a.code}`}
          code={a.code}
          city={a.city}
          airport={a.name}
          countryCode={a.countryCode}
          onPress={() => onSelect(a)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  airportPicker: { marginTop: tokens.space.sm },
  airportInput: {
    height: 56,
    borderRadius: tokens.radius.field,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    paddingHorizontal: tokens.space.md,
    ...rn(tokens.type.body),
    color: tokens.colors.textPrimary,
    backgroundColor: tokens.colors.surfaceCard,
    marginBottom: tokens.space.sm,
  },
});
