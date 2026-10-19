import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Button,
  Calendar,
  Icon,
  PageModal,
  type PageModalHandle,
  Photo,
  Toggle,
  TopBar,
  datesChosen,
  rn,
  selectDay,
  sheetTitle,
  todayLocal,
  tokens,
  type Selection,
} from "@bbc/ui";

import { cardPicture } from "@/features/places/place-photo-logic";
import { CLUB_PICTURE, PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";

import { datesEyebrow } from "./dates-page-logic";

/** What the page knows of the trip: the cities for the line over its title, the destination for its photograph. */
export type DatesTrip = {
  fromCity?: string | null;
  toCity?: string | null;
  toCode?: string | null;
  /** The search's dates are flexible (Explore, a destination): the toggle opens on. */
  flexible?: boolean;
};

export type DatesPageHandle = { present: (selection: Selection, trip?: DatesTrip) => void };

type Props = {
  onUse: (selection: Selection) => void;
  /**
   * Where the dates can be left open — a search, Explore's or a destination's: the toggle `Keep the dates flexible`,
   * and `Use these dates` with it on is this. A request has dates (its legs need them): there, no toggle.
   */
  onFlexible?: () => void;
};

/**
 * The dates page (07, 24): the wordmark over the destination's photograph — the trip, `Travel dates` and what to do —
 * then two months, the toggle where the dates may stay open, `Preferred dates` and `Use these dates →` pinned at the
 * foot. A whole page over the screen and its sheets: it opens from the request sheet as from Explore's chips.
 */
export const DatesPage = forwardRef<DatesPageHandle, Props>(function DatesPage({ onUse, onFlexible }, ref) {
  const page = useRef<PageModalHandle>(null);
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Selection | null>(null);
  const [trip, setTrip] = useState<DatesTrip>({});
  const [flexible, setFlexible] = useState(false);
  // Each opening starts the months where the chosen dates are: the calendar is mounted anew.
  const [opening, setOpening] = useState(0);
  const photoFor = usePlacePhotos(open ? [trip.toCode] : []);
  const today = todayLocal();

  useImperativeHandle(ref, () => ({
    present(selection, about = {}) {
      setSel(selection);
      setTrip(about);
      setFlexible(onFlexible != null && about.flexible === true);
      setOpening((n) => n + 1);
      setOpen(true);
      page.current?.present();
    },
  }));

  const ready = flexible || (sel != null && datesChosen(sel));
  const title = flexible || !sel ? "Travel dates" : sheetTitle(sel);
  const eyebrow = datesEyebrow(trip.fromCity, trip.toCity);
  const picture = cardPicture(undefined, photoFor(trip.toCode), PICTURE_HEADERS);

  function use() {
    if (flexible) onFlexible?.();
    else if (sel && datesChosen(sel)) onUse(sel);
    else return;
    page.current?.dismiss();
  }

  return (
    <PageModal ref={page} testID="dates.root" onDismiss={() => setOpen(false)}>
      {/* The page is white: dark glyphs while it is up; the screen's own come back when it goes. */}
      {open ? <StatusBar style="dark" /> : null}
      <View style={{ paddingTop: insets.top }}>
        <TopBar onBack={() => page.current?.dismiss()} backTestID="dates.close" />
      </View>
      <BottomSheetScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header} accessible accessibilityRole="header" accessibilityLabel={`${title}. ${eyebrow}`}>
          <Photo source={picture} fallback={CLUB_PICTURE} style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={["transparent", tokens.colors.photoVeil]}
            locations={[0.25, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.headerText}>
            {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.lead}>Select your preferred travel dates.</Text>
          </View>
        </View>
        {sel ? (
          <Calendar
            key={opening}
            testID="dates.calendar"
            selection={sel}
            today={today}
            disabled={flexible}
            onSelect={(d) => setSel(selectDay(sel, d, today))}
          />
        ) : null}
        {onFlexible ? (
          <View style={styles.flexible}>
            <View style={styles.flexibleText}>
              <Text style={styles.rowTitle}>Keep the dates flexible</Text>
              <Text style={styles.rowBody}>See the fares for any day.</Text>
            </View>
            <Toggle
              testID="dates.flexible"
              accessibilityLabel="Keep the dates flexible"
              value={flexible}
              onChange={setFlexible}
            />
          </View>
        ) : null}
        <View style={styles.preferred}>
          <View style={styles.preferredIcon}>
            <Icon name="calendar" size={20} color={tokens.colors.textPrimary} strokeWidth={1.75} />
          </View>
          <View style={styles.flexibleText}>
            <Text style={styles.rowTitle}>Preferred dates</Text>
            <Text style={styles.rowBody}>Your specialist confirms availability.</Text>
          </View>
        </View>
      </BottomSheetScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, tokens.space.sm) + tokens.space.xs }]}>
        <Button
          testID="dates.use"
          label="Use these dates"
          variant="primary"
          trailing="arrow"
          trailingAtEdge
          disabled={!ready}
          onPress={use}
        />
      </View>
    </PageModal>
  );
});

/** 07: the photograph 144 pt tall in the gutters, radius 16. */
const HEADER = 144;

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: tokens.space.gutter, paddingBottom: tokens.space.lg, gap: tokens.space.sm },
  header: {
    height: HEADER,
    borderRadius: tokens.radius.md,
    overflow: "hidden",
    justifyContent: "flex-end",
    backgroundColor: tokens.colors.surfaceTint,
  },
  headerText: { padding: tokens.space.md, gap: 2 },
  eyebrow: { ...rn(tokens.type.label), color: tokens.colors.textOnPhoto },
  title: { ...rn(tokens.type.headline), color: tokens.colors.textOnPhoto },
  lead: { ...rn(tokens.type.bodySm), color: tokens.colors.textOnPhoto },
  flexible: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    padding: tokens.space.md,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.surfaceCard,
    ...tokens.elevation.card,
  },
  flexibleText: { flex: 1, gap: 2 },
  rowTitle: { ...rn(tokens.type.bodyStrong), color: tokens.colors.textPrimary },
  rowBody: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  preferred: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    paddingHorizontal: tokens.space.xs,
    paddingVertical: tokens.space.xs,
  },
  preferredIcon: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tokens.colors.surfaceTint,
  },
  footer: {
    paddingHorizontal: tokens.space.gutter,
    paddingTop: tokens.space.sm,
    backgroundColor: tokens.colors.surfacePage,
  },
});
