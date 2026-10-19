import { Redirect } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fixture } from "@bbc/shared/fixture";
import {
  AirportRow,
  Avatar,
  BackButton,
  Button,
  CabinCard,
  CardSkeleton,
  CheckCircle,
  Chip,
  CloseButton,
  EmptyState,
  InfoCard,
  ListRow,
  NoticeCard,
  OfferCard,
  OfferCardWide,
  CarouselRow,
  PickerField,
  ProgressLine,
  RoundButton,
  RowGroup,
  RowSkeleton,
  SavePill,
  SearchField,
  SectionHeader,
  SectionLabel,
  Segmented,
  StatusBadge,
  Stepper,
  TabBar,
  TextButton,
  TextField,
  FieldError,
  FlightCard,
  FlightOverview,
  PopularCard,
  RecentRow,
  RouteCard,
  TripCard,
  TripSummaryCard,
  YourFareCard,
  Toggle,
  TopBar,
  Wordmark,
  tokens,
  rn,
} from "@bbc/ui";

import { CLUB_PICTURE } from "@/features/places/usePlacePhotos";

/**
 * The route: the gallery in a development build only. A release build that reaches it — a link, Expo's sitemap — goes
 * to the app's start instead of a blank page with no way back (ADR-IMPL-047).
 */
export default function GalleryRoute() {
  return __DEV__ ? <GalleryScreen /> : <Redirect href="/" />;
}

/**
 * The 3.0 components side by side with the component sheets (isolated/bbc-club-3.0-design/final/components, 37–42):
 * a component without a state here does not exist.
 */
function GalleryScreen() {
  const insets = useSafeAreaInsets();
  const [trip, setTrip] = useState<"round" | "oneway">("round");
  const [adults, setAdults] = useState(1);
  const [flexible, setFlexible] = useState(false);
  const [filter, setFilter] = useState("all");
  const [tab, setTab] = useState<"explore" | "requests" | "profile">("explore");
  const [query, setQuery] = useState("Lon");
  const [cabin, setCabin] = useState<"business" | "first">("business");
  const noop = () => undefined;

  return (
    <ScrollView
      testID="gallery.root"
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 48 }]}
    >
      <Wordmark />
      <Text style={styles.h1}>Components</Text>

      <SectionHeader title="Buttons" size="subtitle" />
      <Button testID="gallery.button.continue" label="Continue" trailing="arrow" onPress={noop} />
      <Button testID="gallery.button.call" label="Call your specialist" icon="phone" onPress={noop} />
      <Button testID="gallery.button.disabled" label="Continue" trailing="arrow" disabled onPress={noop} />
      <Button testID="gallery.button.sending" label="Sending…" busy onPress={noop} />
      <Button testID="gallery.button.edge" label="Use these dates" trailing="arrow" trailingAtEdge onPress={noop} />
      <View style={styles.row}>
        <Button
          testID="gallery.button.callUs"
          label="Call us"
          icon="phone"
          variant="outline"
          fill={false}
          onPress={noop}
        />
        <TextButton testID="gallery.text.skip" label="Skip" tone="secondary" size="button" onPress={noop} />
        <TextButton testID="gallery.text.seeAll" label="See all" chevron onPress={noop} />
        <TextButton testID="gallery.text.cancel" label="Cancel" onPress={noop} />
      </View>
      <Button testID="gallery.button.signOut" label="Sign out" variant="destructive" onPress={noop} />
      <Button testID="gallery.button.delete" label="Delete account" variant="destructive-filled" onPress={noop} />
      <View style={[styles.row, styles.photoStrip]}>
        <BackButton testID="gallery.round.back" variant="photo" onPress={noop} />
        <RoundButton testID="gallery.round.share" icon="share" accessibilityLabel="Share" onPress={noop} />
        <RoundButton testID="gallery.round.heart" icon="heart" accessibilityLabel="Save" onPress={noop} />
        <RoundButton testID="gallery.round.bookmark" icon="bookmark" accessibilityLabel="Save" onPress={noop} />
        <RoundButton testID="gallery.round.close" icon="x" accessibilityLabel="Close" onPress={noop} />
      </View>

      <SectionHeader title="Fields and controls" size="subtitle" />
      <SearchField testID="gallery.search.bar" placeholder="Where would you like to go?" onPress={noop} />
      <SearchField
        testID="gallery.search.typing"
        placeholder="Where would you like to go?"
        editable
        value={query ? { text: query } : null}
        onChangeText={setQuery}
        onClear={() => setQuery("")}
        onCancel={noop}
      />
      <TextField testID="gallery.field.name" label="Name" icon="user" defaultValue="Daniel Reed" />
      <TextField testID="gallery.field.phone" label="Phone" icon="phone" defaultValue="+1 212 555 0142" />
      <TextField
        testID="gallery.field.email"
        label="Email"
        icon="mail"
        defaultValue="daniel@example.com"
        editable={false}
      />
      <TextField
        testID="gallery.field.note"
        label="Note (optional)"
        icon="message"
        placeholder="Tell us about your travel plans or any special requests"
      />
      <View style={styles.row}>
        <PickerField
          testID="gallery.picker.depart"
          label="Depart"
          value="Nov 12, 2026"
          icon="calendar"
          onPress={noop}
        />
        <PickerField
          testID="gallery.picker.return"
          label="Return"
          value={null}
          placeholder="Select date"
          icon="calendar"
          error
          onPress={noop}
        />
      </View>
      <FieldError>Select a return date or choose One way.</FieldError>
      <PickerField testID="gallery.picker.travelers" label="Travelers" value="1 adult" icon="user" onPress={noop} />
      <Segmented
        value={trip}
        onChange={setTrip}
        options={[
          { key: "round", label: "Round trip", testID: "gallery.trip.round" },
          { key: "oneway", label: "One way", testID: "gallery.trip.oneway" },
        ]}
      />
      <Stepper
        testID="gallery.stepper"
        label="Adults"
        caption="Ages 18+"
        icon="user"
        value={adults}
        min={1}
        onChange={setAdults}
      />
      <View style={styles.row}>
        <Toggle testID="gallery.toggle.on" value accessibilityLabel="On" onChange={noop} />
        <Toggle
          testID="gallery.toggle.flexible"
          value={flexible}
          accessibilityLabel="Keep the dates flexible"
          onChange={setFlexible}
        />
      </View>
      <View style={styles.row}>
        <Chip testID="gallery.chip.dates" icon="calendar" label="Nov 12 – 19, 2026" onPress={noop} />
        <Chip testID="gallery.chip.cabin" icon="seat" label="Business" onPress={noop} />
        <Chip testID="gallery.chip.adults" icon="user" label="1 adult" onPress={noop} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {["all", "quote_ready", "received", "booked", "closed"].map((key) => (
          <Chip
            key={key}
            testID={`gallery.filter.${key}`}
            variant="filter"
            label={
              { all: "All", quote_ready: "Quote ready", received: "Received", booked: "Booked", closed: "Closed" }[key]!
            }
            selected={filter === key}
            onPress={() => setFilter(key)}
          />
        ))}
      </ScrollView>
      <ProgressLine fraction={2 / 3} />

      <SectionHeader title="Cards and rows" size="subtitle" />
      <InfoCard
        icon="family"
        iconStyle="bare"
        title="Travelling with children?"
        body="Add their ages in a note when you request."
      />
      <CarouselRow testID="gallery.offers">
        <OfferCard
          testID="gallery.offer.paris"
          city="Paris"
          country="France"
          fromPrice="$3,450"
          savePercent={54}
          image={null}
          fallback={CLUB_PICTURE}
          onPress={noop}
        />
        <OfferCard
          testID="gallery.offer.tokyo"
          city="Tokyo"
          country="Japan"
          fromPrice="$4,200"
          savePercent={44}
          image={null}
          fallback={CLUB_PICTURE}
          onPress={noop}
        />
        <OfferCard
          testID="gallery.offer.dubai"
          city="Dubai"
          country="UAE"
          fromPrice="$4,100"
          image={null}
          fallback={CLUB_PICTURE}
          onPress={noop}
        />
      </CarouselRow>
      <View style={styles.row}>
        <OfferCardWide
          span="half"
          testID="gallery.wide.london"
          city="London"
          country="United Kingdom"
          fromPrice="$3,900"
          savePercent={48}
          image={null}
          fallback={CLUB_PICTURE}
          onPress={noop}
        />
        <OfferCardWide
          span="half"
          testID="gallery.wide.paris"
          city="Paris"
          country="France"
          fromPrice="$3,450"
          savePercent={54}
          image={null}
          fallback={CLUB_PICTURE}
          onPress={noop}
        />
      </View>
      <OfferCardWide
        span="full"
        testID="gallery.wide.tokyo"
        city="Tokyo"
        country="Japan"
        fromPrice="$4,200"
        savePercent={44}
        image={null}
        fallback={CLUB_PICTURE}
        onPress={noop}
      />
      <AirportRow testID="gallery.airport.lhr" code="LHR" city="London" airport="Heathrow Airport" onPress={noop} />
      <AirportRow
        testID="gallery.airport.jfk"
        layout="code"
        code="JFK"
        city="New York"
        airport="John F. Kennedy"
        onPress={noop}
      />
      <RowGroup>
        <ListRow testID="gallery.row.home" icon="plane" label="Home airport" value="New York (JFK)" onPress={noop} />
        <ListRow testID="gallery.row.cabin" icon="seat" label="Cabin" value="Business" onPress={noop} />
        <ListRow testID="gallery.row.travelers" icon="users" label="Travelers" value="1 adult" onPress={noop} />
        <ListRow testID="gallery.row.phone" icon="phone" label="Phone" value="+1 212 555 0142" onPress={noop} />
      </RowGroup>
      <RowGroup>
        <ListRow
          testID="gallery.row.notifications"
          icon="bell"
          label="Notifications"
          subtitle="Request updates are always on."
          value="Preferences"
          onPress={noop}
        />
        <ListRow testID="gallery.row.password" icon="lock" label="Password" value="Change" onPress={noop} />
      </RowGroup>
      <ListRow testID="gallery.row.delete" icon="trash" label="Delete account" danger onPress={noop} />
      <RowGroup>
        <ListRow
          testID="gallery.row.stackedHome"
          stacked
          icon="plane"
          label="Home airport"
          value="New York (JFK)"
          onPress={noop}
        />
        <ListRow testID="gallery.row.stackedCabin" stacked icon="seat" label="Cabin" value="Business" onPress={noop} />
      </RowGroup>

      <View style={styles.row}>
        <CabinCard
          testID="gallery.cabin.business"
          icon="seat"
          title="Business"
          line="More space, a better journey"
          selected={cabin === "business"}
          onPress={() => setCabin("business")}
        />
        <CabinCard
          testID="gallery.cabin.first"
          icon="armchair"
          title="First"
          line="The highest level of comfort"
          selected={cabin === "first"}
          onPress={() => setCabin("first")}
        />
      </View>
      <PopularCard
        testID="gallery.popular"
        city="London"
        airport="Heathrow Airport  ·  LHR"
        fromPrice="$3,900"
        image={null}
        fallback={CLUB_PICTURE}
        onPress={noop}
      />
      <RecentRow
        testID="gallery.recent"
        city="Paris"
        detail="Oct 5 – 12, 2026"
        image={null}
        fallback={CLUB_PICTURE}
        onPress={noop}
      />
      <FlightCard testID="gallery.flight.detailed" fare={fixture.fares[0]!} layout="detailed" onPress={noop} />
      <FlightCard testID="gallery.flight.compact" fare={fixture.fares[1]!} layout="compact" onPress={noop} />
      <YourFareCard testID="gallery.yourFare" price={fixture.fares[0]!.price} percent={46} />
      <FlightOverview testID="gallery.flightOverview" fare={fixture.fares[0]!} />
      <RouteCard
        testID="gallery.route"
        from={{ code: "JFK", city: "New York", lat: 40.6413, lng: -73.7781 }}
        to={{ code: "LHR", city: "London", lat: 51.47, lng: -0.4543 }}
      />
      <TripSummaryCard
        testID="gallery.tripSummary"
        photo={null}
        fallback={CLUB_PICTURE}
        title="New York to London"
        cabin="Business"
        dates="Nov 12 – 19, 2026"
        route="JFK 18:55 → LHR 07:00 +1"
        carrier={{ name: "British Airways", logoUrl: null }}
        price={{ amount: "$4,200", percent: 46 }}
      />
      <TripCard
        testID="gallery.trip"
        photo={null}
        fallback={CLUB_PICTURE}
        cabin="BUSINESS CLASS"
        from="JFK"
        to="LHR"
        dates="Nov 12 – 19, 2026"
        facts="Round trip · 1 adult"
        carrier={{ name: "British Airways", logoUrl: null }}
      />

      <SectionHeader title="Status and feedback" size="subtitle" />
      <View style={styles.row}>
        <StatusBadge status="quote_ready" />
        <StatusBadge status="received" />
        <StatusBadge status="booked" />
      </View>
      <View style={styles.row}>
        <StatusBadge status="closed" />
        <StatusBadge status="not_sent" />
        <SavePill percent={48} />
      </View>
      <NoticeCard
        testID="gallery.notice.error"
        tone="error"
        title="Something went wrong."
        link={{ label: "Try again", onPress: noop, testID: "gallery.notice.error.retry" }}
      />
      <NoticeCard
        testID="gallery.notice.offline"
        tone="offline"
        title="You’re offline."
        body="You can still request a fare — it goes out as soon as you’re back online."
        link={{ label: "Try again", onPress: noop, testID: "gallery.notice.offline.retry" }}
      />
      <NoticeCard
        testID="gallery.notice.attention"
        tone="attention"
        title="One request needs your attention."
        body="Open your request to check the details and try again."
      />
      <InfoCard
        icon="phone"
        title="Your quote is ready."
        body="A specialist will call shortly to confirm the details."
      />
      <CardSkeleton />
      <RowSkeleton />
      <View style={styles.row}>
        <CheckCircle />
        <Avatar initials="DR" size={56} />
        <Avatar initials="DR" size={120} />
      </View>
      <EmptyState
        testID="gallery.empty"
        title="No offers yet."
        body="Your specialist's offers will appear here. Search a destination to request a fare."
        primary={{ label: "Search a destination", onPress: noop }}
        primaryFill={false}
      />
      <EmptyState
        testID="gallery.empty.airports"
        icon="search"
        title="No airports found"
        body="Try a city name or a three-letter airport code, such as JFK."
        primary={{ label: "Clear search", onPress: noop }}
        primaryVariant="outline"
        primaryFill={false}
      />

      <SectionHeader title="Navigation" size="subtitle" />
      <TopBar
        onBack={noop}
        backTestID="gallery.topbar.back"
        right={
          <RoundButton
            testID="gallery.topbar.profile"
            icon="user"
            tone="tint"
            accessibilityLabel="Profile"
            onPress={noop}
          />
        }
      />
      <TopBar title="Settings" onBack={noop} backTestID="gallery.topbar.settings.back" />
      <SectionHeader
        title="Offers to inspire"
        action={{ label: "See all", onPress: noop, testID: "gallery.seeAll", chevron: true }}
      />
      <SectionLabel label="Indicative fare" flush />
      <View style={styles.row}>
        <CloseButton testID="gallery.close.plain" onPress={noop} />
        <CloseButton testID="gallery.close.tint" tone="tint" onPress={noop} />
      </View>
      <TabBar testID="gallery.tabbar" active={tab} unread={1} onPress={setTab} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  content: { paddingHorizontal: tokens.space.gutter, gap: tokens.space.md },
  h1: { ...rn(tokens.type.display), color: tokens.colors.textPrimary },
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm, flexWrap: "wrap" },
  photoStrip: { backgroundColor: tokens.colors.sky, padding: tokens.space.sm, borderRadius: tokens.radius.md },
});
