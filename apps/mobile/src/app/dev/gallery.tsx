import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fixture } from "@bbc/shared/fixture";
import {
  AirportRow,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  FareRow,
  GlobeFallback,
  ListRow,
  OfferCard,
  CarouselRow,
  PricePair,
  SearchField,
  SectionLabel,
  StatusBadge,
  TabBar,
  tokens,
  rn,
} from "@bbc/ui";

/** Storybook substitute. A component without a state here does not exist. */
export default function GalleryScreen() {
  if (!__DEV__) return null;

  const insets = useSafeAreaInsets();
  const [chipOn, setChipOn] = useState(false);
  const [tab, setTab] = useState<"explore" | "requests" | "profile">("explore");
  const [pin, setPin] = useState<string | null>("LHR");
  const noop = () => undefined;

  const fareTimed = fixture.fares[0]!;
  const fareNoTimes = fixture.fares[2]!;
  const fareOffer = fixture.fares[1]!;

  return (
    <ScrollView
      testID="gallery.root"
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 48 }]}
    >
      <Text style={styles.h1}>UI gallery</Text>

      <SectionLabel label="Chip" />
      <View style={styles.row}>
        <Chip testID="gallery.chip.default" label="Dates" onPress={noop} />
        <Chip testID="gallery.chip.selected" label="Business" selected={chipOn} onPress={() => setChipOn(!chipOn)} />
        <Chip testID="gallery.chip.icon" label="Travelers" icon="passengers" onPress={noop} />
        <Chip testID="gallery.chip.long" label="Very long cabin filter label" onPress={noop} />
      </View>

      <SectionLabel label="SearchField" />
      <SearchField testID="gallery.search.rest" placeholder="Where to?" onPress={noop} />
      <View style={styles.gap} />
      <SearchField
        testID="gallery.search.filled"
        placeholder="Where to?"
        value={{ prefix: "JFK → ", text: "London · LHR" }}
        onPress={noop}
        onClear={noop}
      />
      <View style={styles.gap} />
      <SearchField
        testID="gallery.search.disabled"
        placeholder="Where to?"
        disabled
        disabledReason="Search needs a connection"
        onPress={noop}
      />

      <SectionLabel label="AirportRow" />
      {fixture.airports.slice(0, 3).map((a) => (
        <AirportRow
          key={a.code}
          testID={`gallery.airport.${a.code}`}
          code={a.code}
          city={a.city}
          airport={a.name}
          countryCode={a.countryCode}
          onPress={noop}
        />
      ))}

      <SectionLabel label="FareRow" />
      <FareRow testID="gallery.fare.timed" fare={fareTimed} onPress={noop} />
      <FareRow testID="gallery.fare.notimes" fare={fareNoTimes} onPress={noop} />
      <FareRow testID="gallery.fare.offer" fare={fareOffer} onPress={noop} />

      <SectionLabel label="OfferCard" />
      <CarouselRow testID="gallery.carousel">
        <OfferCard testID="gallery.offer.full" title="London" fromPrice="FROM $4,200" imageUrl={null} onPress={noop} />
        <OfferCard testID="gallery.offer.noprice" title="Paris" imageUrl={null} onPress={noop} />
        <OfferCard
          testID="gallery.offer.noimage"
          title="Tokyo"
          fromPrice="FROM $4,650"
          imageUrl={null}
          onPress={noop}
        />
      </CarouselRow>

      <SectionLabel label="PricePair" />
      <View style={styles.row}>
        <PricePair price={fareTimed.price} size="sm" />
        <PricePair price={fareTimed.price} size="lg" />
        <PricePair price={{ offer: 3900, currency: "USD" }} size="sm" />
      </View>

      <SectionLabel label="StatusBadge" />
      <View style={styles.row}>
        <StatusBadge status="received" />
        <StatusBadge status="quote_ready" />
        <StatusBadge status="booked" />
        <StatusBadge status="not_sent" />
        <StatusBadge status="mystery_future_status" />
      </View>

      <SectionLabel
        label="SectionLabel"
        action={{ label: "See all", onPress: noop, testID: "gallery.section.seeAll" }}
      />
      <SectionLabel label="Without action" />

      <SectionLabel label="Button" />
      <Button testID="gallery.btn.inverted" label="Inverted" onPress={noop} />
      <View style={styles.gap} />
      <Button testID="gallery.btn.primary" label="Primary" variant="primary" onPress={noop} />
      <View style={styles.gap} />
      <Button testID="gallery.btn.ghost" label="Ghost" variant="ghost" shape="card" onPress={noop} />
      <View style={styles.gap} />
      <Button testID="gallery.btn.busy" label="Busy" busy onPress={noop} />
      <View style={styles.gap} />
      <Button testID="gallery.btn.disabled" label="Disabled" disabled onPress={noop} />
      <View style={styles.gap} />
      <Button testID="gallery.btn.destructive" label="Destructive" variant="destructive" onPress={noop} />

      <SectionLabel label="ListRow" />
      <ListRow testID="gallery.list.label" label="Label only" onPress={noop} />
      <ListRow testID="gallery.list.value" label="Home airport" value="JFK · New York" onPress={noop} />
      <ListRow testID="gallery.list.icon" label="Call support" icon="call" trailing="none" onPress={noop} />
      <ListRow testID="gallery.list.danger" label="Delete account" danger chevron={false} onPress={noop} />

      <SectionLabel label="TabBar" />
      <TabBar testID="gallery.tabbar" active={tab} unread={0} onPress={setTab} />
      <TabBar testID="gallery.tabbar.dot" active="requests" unread={2} onPress={noop} />

      <SectionLabel label="GlobeFallback" />
      <GlobeFallback
        size={320}
        home={{ lat: 40.64, lng: -73.78 }}
        selected={pin}
        onSelect={setPin}
        pins={fixture.destinations.slice(0, 6).map((d) => ({
          code: d.code,
          lat: d.lat,
          lng: d.lng,
          hasOffer: d.hasOffer,
          fromPrice: `from $${d.fromPrice.toLocaleString()}`,
        }))}
      />

      <SectionLabel label="ErrorState" />
      <ErrorState
        testID="gallery.error"
        variant="error"
        title="Something went wrong."
        body="We couldn't load fares just now."
        primary={{ label: "Try again", onPress: noop }}
        secondary={{ label: "Call", onPress: noop }}
        reference="9F3C21A0"
      />
      <View style={styles.gap} />
      <ErrorState
        testID="gallery.gone"
        variant="gone"
        title="This fare has closed."
        body="The price you saw is no longer available."
        primary={{ label: "Request the route", onPress: noop }}
      />
      <View style={styles.gap} />
      <ErrorState
        testID="gallery.offline"
        variant="offline"
        title="You're offline."
        body="Saved offers are still here."
      />

      <SectionLabel label="EmptyState" />
      <EmptyState
        testID="gallery.empty.fares"
        title="We don't publish fares for this route."
        body="Tell us your dates and a specialist calls you with options."
        primary={{ label: "Request a quote", onPress: noop }}
      />
      <View style={styles.gap} />
      <EmptyState
        testID="gallery.empty.requests"
        title="No requests yet."
        body="Search a route or pick an offer to get started."
        primary={{ label: "Search", onPress: noop }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  content: { paddingHorizontal: tokens.space.lg, gap: tokens.space.xs },
  h1: { ...rn(tokens.type.headline), color: tokens.colors.textPrimary, marginBottom: tokens.space.md },
  row: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space.xs, alignItems: "center" },
  gap: { height: tokens.space.sm },
});
