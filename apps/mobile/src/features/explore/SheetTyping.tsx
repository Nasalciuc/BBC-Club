import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { AirportVM } from "@bbc/shared/api/v1/fares";
import { AirportRow, SearchField, SectionLabel, tokens } from "@bbc/ui";

import { fetchAirports, fetchPopular } from "@/lib/api";
import { popularLabel, popularRows } from "./discovery-logic";
import { readRecentAirports } from "./recent-airports";

type Props = {
  onSelect: (airport: AirportVM) => void;
  /** The origin: `POPULAR FROM NEW YORK` is asked for it (ADR-IMPL-039). Null until Home knows it. */
  from: AirportVM | null;
  /** The home screen's destinations — what the sheet shows before the popular ones arrive, or without them. */
  suggestions?: AirportVM[];
};

/**
 * Figma 89:388 (Typing), 104:838 (Search empty) and 536:11093 (Popular from New York): the same search field, now
 * editable with its `Clear`; while typing `AIRPORTS` over the matches; before typing `POPULAR FROM <city>` (the routes
 * members search, then the hubs — at most four), then `RECENT`. Cancel lives in the header.
 */
export function SheetTyping({ onSelect, from, suggestions = [] }: Props) {
  const [airportQuery, setAirportQuery] = useState("");
  const [airportHits, setAirportHits] = useState<AirportVM[]>([]);
  const [recent, setRecent] = useState<AirportVM[]>(() => readRecentAirports());
  const [popular, setPopular] = useState<AirportVM[] | null>(null);
  const fromCode = from?.code;

  useEffect(() => {
    setRecent(readRecentAirports());
  }, []);

  useEffect(() => {
    if (!fromCode) return;
    let cancelled = false;
    void (async () => {
      const result = await fetchPopular(fromCode);
      if (cancelled) return;
      // No popular list (an older server, a failure): the home destinations stand in, as before.
      setPopular(result.ok ? result.data.destinations : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [fromCode]);

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
  const popularList = popular && from ? popularRows(popular, recent, from) : null;
  const beforeTyping = popularList ?? suggestions.filter((a) => !recentCodes.has(a.code)).slice(0, 8);
  const label = emptyQuery ? (popularList && from ? popularLabel(from) : "Airports") : "Airports";
  const airports = emptyQuery ? beforeTyping : airportHits;

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
      {airports.length > 0 ? <SectionLabel label={label} /> : null}
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
