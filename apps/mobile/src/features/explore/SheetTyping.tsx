import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { AirportVM } from "@bbc/shared/api/v1/fares";
import { AirportRow, SearchField, SectionLabel, tokens } from "@bbc/ui";

import { fetchAirports } from "@/lib/api";
import { readRecentAirports } from "./recent-airports";

type Props = {
  onSelect: (airport: AirportVM) => void;
  suggestions?: AirportVM[];
};

/**
 * Figma 89:388 (Typing) and 104:838 (Search empty): the same search field, now editable with its `Clear`, then
 * `AIRPORTS` — the matches while typing, the suggestions before — and `RECENT`. Cancel lives in the header.
 */
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
  const airports = emptyQuery ? suggestions.filter((a) => !recentCodes.has(a.code)).slice(0, 8) : airportHits;

  return (
    <View style={styles.airportPicker}>
      <SearchField
        testID="explore.airportQuery"
        editable
        autoFocus
        placeholder="Where would you like to go?"
        value={airportQuery ? { text: airportQuery } : null}
        onChangeText={setAirportQuery}
        onClear={() => setAirportQuery("")}
      />
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
      {emptyQuery && recent.length > 0 ? <SectionLabel label="Recent" /> : null}
      {emptyQuery
        ? recent.map((a) => (
            <AirportRow
              key={`recent.${a.code}`}
              testID={`explore.airport.recent.${a.code}`}
              code={a.code}
              city={a.city}
              airport={a.name}
              countryCode={a.countryCode}
              onPress={() => onSelect(a)}
            />
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  airportPicker: { marginTop: tokens.space.sm },
});
