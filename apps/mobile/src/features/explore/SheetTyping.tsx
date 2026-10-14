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
 * members search, then the hubs — at most four); `RECENT` under either. Cancel lives in the header.
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
  // 89:388: RECENT stays under the matches while typing; an airport already in the matches is not listed twice.
  const shownCodes = new Set(airports.map((a) => a.code));
  const recentRows = emptyQuery ? recent : recent.filter((a) => !shownCodes.has(a.code));

  return (
    <>
      <SearchField
        testID="explore.airportQuery"
        editable
        autoFocus
        placeholder="Where would you like to go?"
        value={airportQuery ? { text: airportQuery } : null}
        onChangeText={setAirportQuery}
        onClear={() => setAirportQuery("")}
      />
      {airports.length > 0 || recentRows.length > 0 ? (
        <View style={styles.content}>
          {airports.length > 0 ? <SectionLabel box label={label} /> : null}
          {airports.map((a) => (
            <AirportRow
              key={a.code}
              testID={`explore.airport.${a.code}`}
              code={a.code}
              city={a.city}
              airport={a.name}
              onPress={() => onSelect(a)}
            />
          ))}
          {recentRows.length > 0 ? <SectionLabel box label="Recent" /> : null}
          {recentRows.map((a) => (
            <AirportRow
              key={`recent.${a.code}`}
              testID={`explore.airport.recent.${a.code}`}
              code={a.code}
              city={a.city}
              airport={a.name}
              state="recent"
              onPress={() => onSelect(a)}
            />
          ))}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  // Figma 89:388 / 104:838: 12 pt under the field, then the labels' 32-pt boxes and the 72-pt rows, all 12 pt apart; a
  // recent airport carries the clock.
  content: { marginTop: tokens.space.sm, gap: tokens.space.sm },
});
