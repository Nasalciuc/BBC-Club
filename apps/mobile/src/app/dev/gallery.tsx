import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fixture } from "@bbc/shared/fixture";

import { CLUB_PICTURE } from "@/features/places/usePlacePhotos";
import {
  AirportRow,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  StateMessage,
  FareRow,
  GlobeFallback,
  ListRow,
  OfferCard,
  CarouselRow,
  PhotoCredit,
  PricePair,
  ProfileHero,
  RequestCard,
  SearchField,
  SectionLabel,
  StatusBadge,
  Stepper,
  type BadgeStatus,
  TabBar,
  Timeline,
  Calendar,
  tokens,
  rn,
  type Selection,
} from "@bbc/ui";

/** Storybook substitute. A component without a state here does not exist. */
export default function GalleryScreen() {
  if (!__DEV__) return null;

  const insets = useSafeAreaInsets();
  const [chipOn, setChipOn] = useState(false);
  const [tab, setTab] = useState<"explore" | "requests" | "profile">("explore");
  const [pin, setPin] = useState<string | null>("LHR");
  const [stepperAdult, setStepperAdult] = useState(1);
  const [stepperChild, setStepperChild] = useState(0);
  const [stepperInfant, setStepperInfant] = useState(0);
  const [editableQuery, setEditableQuery] = useState("");
  const noop = () => undefined;
  const calendarToday = "2026-09-26";
  const calendarDepart: Selection = { tripType: "round", depart: "2026-10-12", ret: null, editing: "return" };
  const calendarRange: Selection = {
    tripType: "round",
    depart: "2026-10-12",
    ret: "2026-10-19",
    editing: "depart",
  };
  const calendarOneWay: Selection = { tripType: "oneway", depart: "2026-10-12", ret: null, editing: "depart" };

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
      <View style={styles.gap} />
      <SearchField
        testID="gallery.search.editable"
        placeholder="City or code"
        editable
        value={editableQuery ? { text: editableQuery } : null}
        onChangeText={setEditableQuery}
        onClear={() => setEditableQuery("")}
      />

      <SectionLabel label="Stepper" />
      <Stepper
        testID="gallery.stepper.adult"
        label="Adults"
        value={stepperAdult}
        min={1}
        max={9}
        onChange={setStepperAdult}
      />
      <Stepper
        testID="gallery.stepper.child"
        label="Children"
        value={stepperChild}
        min={0}
        max={8}
        onChange={setStepperChild}
      />
      <Stepper
        testID="gallery.stepper.infant"
        label="Infants"
        value={stepperInfant}
        min={0}
        max={4}
        onChange={setStepperInfant}
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

      <SectionLabel label="Bronze — the three places it lives" />
      <Text style={styles.note}>Selected globe pin · offer price on FareRow · Requests unread dot</Text>

      <SectionLabel label="FareRow" />
      <FareRow testID="gallery.fare.timed" fare={fareTimed} onPress={noop} />
      <FareRow testID="gallery.fare.notimes" fare={fareNoTimes} onPress={noop} />
      <FareRow testID="gallery.fare.offer" fare={fareOffer} onPress={noop} />

      <SectionLabel label="OfferCard" />
      <CarouselRow testID="gallery.carousel">
        <OfferCard
          testID="gallery.offer.full"
          title="London"
          fromPrice="FROM $4,200"
          image={null}
          fallback={CLUB_PICTURE}
          onPress={noop}
        />
        <OfferCard testID="gallery.offer.noprice" title="Paris" image={null} fallback={CLUB_PICTURE} onPress={noop} />
        <OfferCard
          testID="gallery.offer.noimage"
          title="Tokyo"
          fromPrice="FROM $4,650"
          image={null}
          fallback={null}
          onPress={noop}
        />
      </CarouselRow>

      {/* Figma 436:1221; the club's image stands in for the city's photo (ADR-IMPL-043). */}
      <SectionLabel label="ProfileHero" />
      <ProfileHero
        testID="gallery.profileHero"
        name="Alex Morgan"
        home="Flies from JFK"
        image={null}
        fallback={CLUB_PICTURE}
      />
      <PhotoCredit
        testID="gallery.photoCredit"
        label="Photo: Jane Doe · CC BY-SA 4.0 · Wikimedia Commons"
        accessibilityLabel="Photo by Jane Doe, CC BY-SA 4.0, Wikimedia Commons"
        onPress={noop}
      />

      <SectionLabel label="PricePair" />
      <View style={styles.row}>
        <PricePair price={fareTimed.price} size="sm" />
        <PricePair price={fareTimed.price} size="lg" />
        <PricePair price={{ offer: 3900, currency: "USD" }} size="sm" />
      </View>
      {/* Figma 26:29: a request's fare (the detail), with and without the published fare beside it; then a fare's
          page (the editorial). */}
      <PricePair price={{ offer: fareTimed.price.offer, currency: fareTimed.price.currency }} layout="detail" />
      <PricePair price={fareTimed.price} layout="detail" />
      <PricePair price={fareTimed.price} layout="editorial" />

      <SectionLabel label="StatusBadge" />
      <View style={styles.row}>
        <StatusBadge status="received" />
        <StatusBadge status="quote_ready" />
        <StatusBadge status="booked" />
        <StatusBadge status="not_sent" />
        {/* A state a newer server adds reads as Received (and warns in development). */}
        <StatusBadge status={"mystery_future_status" as BadgeStatus} />
        <StatusBadge status="quote_ready" size="sm" />
      </View>

      <SectionLabel label="Calendar" />
      <Calendar
        testID="gallery.calendar.depart"
        selection={calendarDepart}
        today={calendarToday}
        months={2}
        onSelect={noop}
      />
      <Calendar
        testID="gallery.calendar.range"
        selection={calendarRange}
        today={calendarToday}
        months={2}
        onSelect={noop}
      />
      <Calendar
        testID="gallery.calendar.oneway"
        selection={calendarOneWay}
        today={calendarToday}
        months={2}
        onSelect={noop}
      />

      <SectionLabel label="Timeline" />
      <Timeline
        testID="gallery.timeline.received"
        status="received"
        events={[{ status: "received", at: "2026-09-18T12:00:00.000Z" }]}
      />
      <View style={styles.gap} />
      <Timeline
        testID="gallery.timeline.partial"
        status="assigned"
        currentCaption="A specialist will call you shortly."
        events={[
          { status: "received", at: "2026-09-18T12:00:00.000Z" },
          { status: "assigned", at: "2026-09-18T14:30:00.000Z", note: "A specialist will call you shortly." },
        ]}
      />
      <View style={styles.gap} />
      <Timeline
        testID="gallery.timeline.quoted"
        status="quoted"
        currentCaption="Review the quote with your specialist."
        events={[
          { status: "received", at: "2026-09-18T12:00:00.000Z" },
          { status: "quoted", at: "2026-09-19T12:00:00.000Z" },
        ]}
      />
      <View style={styles.gap} />
      <Timeline
        testID="gallery.timeline.booked"
        status="booked"
        events={[{ status: "booked", at: "2026-09-20T12:00:00.000Z" }]}
      />
      <View style={styles.gap} />
      <Text testID="gallery.request.closedLine" style={styles.closedLine}>
        Closed · Oct 3
      </Text>
      <Text style={styles.closedSentence}>This request is closed.</Text>
      <View style={styles.gap} />
      <Timeline testID="gallery.timeline.empty" status="queued" events={[]} />

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
      <ListRow testID="gallery.list.static" label="Email" value="member@example.com" />
      <ListRow testID="gallery.list.comingSoon" label="Privacy policy" value="Coming soon" />

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

      <SectionLabel label="RequestCard" />
      <View style={styles.cardStack}>
        <RequestCard
          testID="gallery.request.quote"
          title="London"
          facts="JFK → LHR · BUSINESS"
          when="OCT 12–19 · 1 ADULT"
          badgeStatus="quote_ready"
          onPress={noop}
        />
        <RequestCard
          testID="gallery.request.received"
          title="Paris"
          facts="JFK → CDG · BUSINESS"
          when="NOV 3 · 2 ADULTS"
          badgeStatus="received"
          onPress={noop}
        />
        <RequestCard
          testID="gallery.request.notSent"
          title="London"
          facts="JFK → LHR · BUSINESS"
          when="Your travel details are saved"
          badgeStatus="not_sent"
          onPress={noop}
        />
        <RequestCard
          testID="gallery.request.booked"
          title="Tokyo"
          facts="JFK → NRT · BUSINESS"
          when="AUG 2 · 1 ADULT"
          badgeStatus="booked"
          onPress={noop}
        />
        <RequestCard
          testID="gallery.request.closed"
          title="London"
          facts="JFK → LHR · BUSINESS"
          when="CLOSED · OCT 3"
          badgeStatus={null}
          onPress={noop}
        />
        <RequestCard
          testID="gallery.request.compact"
          size="compact"
          title="Dubai"
          facts="JFK → DXB · FIRST"
          when="DEC 18 · 1 ADULT"
          badgeStatus="received"
          onPress={noop}
        />
        <RequestCard
          testID="gallery.request.long"
          title="Rio de Janeiro"
          facts="JFK → GIG · BUSINESS"
          when="OCT 30–NOV 6 · 2 ADULTS · 1 CHILD · 1 INFANT"
          badgeStatus="received"
          onPress={noop}
        />
        {/* A city too long to share its line with the badge at the default text size: the badge moves below it. */}
        <RequestCard
          testID="gallery.request.longCity"
          title="Santa Cruz de Tenerife"
          facts="JFK → TFN · BUSINESS"
          when="NOV 3 · 1 ADULT"
          badgeStatus="quote_ready"
          onPress={noop}
        />
      </View>

      <SectionLabel label="StateMessage" />
      <StateMessage
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
  note: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary, marginBottom: tokens.space.sm },
  row: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space.xs, alignItems: "center" },
  gap: { height: tokens.space.sm },
  cardStack: { gap: tokens.space.sm },
  closedLine: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  closedSentence: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
});
