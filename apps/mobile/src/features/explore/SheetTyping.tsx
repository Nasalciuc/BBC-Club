import { useEffect, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import type { AirportVM } from "@bbc/shared/api/v1/fares";
import { AirportRow, SectionLabel, tokens, rn } from "@bbc/ui";

import { fetchAirports } from "@/lib/api";
import { readRecentAirports } from "./recent-airports";

type Props = {
  onSelect: (airport: AirportVM) => void;
  suggestions?: AirportVM[];
};

export function SheetTyping({ onSelect, suggestions = [] }: Props) {
  const [airportQuery, setAirportQuery] = useState("");
  const [airportHits, setAirportHits] = useState<AirportVM[]>([]);
  const [recent, setRecent] = useState<AirportVM[]>(() => readRecentAirports());

  useEffect(() => {
    setRecent(readRecentAirports());
  }, []);

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

  const emptyQuery = airportQuery.trim().length < 2;
  const recentCodes = new Set(recent.map((a) => a.code));
  const airports = suggestions.filter((a) => !recentCodes.has(a.code)).slice(0, 8);

  return (
    <View style={styles.airportPicker}>
      <TextInput
        testID="explore.airportQuery"
        value={airportQuery}
        onChangeText={setAirportQuery}
        placeholder="Where would you like to go?"
        placeholderTextColor={tokens.colors.textTertiary}
        style={styles.airportInput}
        autoFocus
      />
      {emptyQuery ? (
        <>
          {airports.length > 0 ? <SectionLabel label="Airports" /> : null}
          {airports.map((a) => (
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
          {recent.length > 0 ? <SectionLabel label="Recent" /> : null}
          {recent.map((a) => (
            <AirportRow
              key={`recent.${a.code}`}
              testID={`explore.airport.recent.${a.code}`}
              code={a.code}
              city={a.city}
              airport={a.name}
              countryCode={a.countryCode}
              onPress={() => onSelect(a)}
            />
          ))}
        </>
      ) : (
        airportHits.map((a) => (
          <AirportRow
            key={a.code}
            testID={`explore.airport.${a.code}`}
            code={a.code}
            city={a.city}
            airport={a.name}
            countryCode={a.countryCode}
            onPress={() => onSelect(a)}
          />
        ))
      )}
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
