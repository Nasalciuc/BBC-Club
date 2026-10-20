import { BottomSheetScrollView, useBottomSheetModal } from "@gorhom/bottom-sheet";
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
  RoundButton,
  Toggle,
  TopBar,
  baselineOffset,
  datesChosen,
  rn,
  selectDay,
  sheetTitle,
  todayLocal,
  tokens,
  type Selection,
} from "@bbc/ui";

import { useOpenTab } from "@/features/navigation/useOpenTab";
import { clubPhoto } from "@/features/places/club-photos";
import { cardPicture } from "@/features/places/place-photo-logic";
import { PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";

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
 * 07 and 24, measured (pt under the safe area unless said): the top bar (TopBar `dates`) and then, 19 pt under the
 * safe area, the photograph in its frame — the trip, the title and what to do over it in white — the two months, the
 * toggle's card, `Preferred dates` and the pill pinned 17 pt over the screen's foot.
 */
const PAGE = {
  bar: 19.04,
  hero: {
    height: 144.55,
    left: 7.85,
    right: 6.93,
    radius: 7.5,
    /** Pen x and baselines from the frame's corner; the two lines of the words 14.5 apart. */
    text: { eyebrowLeft: 14.14, left: 14.15, subLeft: 14.5, eyebrow: 73.18, title: 97.94, sub: 114.98, subPitch: 14.5 },
  },
  card: { left: 7.16, right: 7.16, radius: 10 },
  calendar: { top: 7.85 },
  flexible: {
    /** Under December's card: 6.21 on 07, less what the uniform rows add to that card's height. */
    top: 5.6,
    height: 46.16,
    title: { left: 15.56, baseline: 20.5 },
    body: { left: 15.82, baseline: 34.7 },
    toggle: { right: 13.16 },
  },
  preferred: {
    top: 11.36,
    circle: { left: 17.9, size: 28.4 },
    glyph: 14,
    title: { left: 59.38, baseline: 11.66 },
    body: { left: 59.78, baseline: 25.68 },
  },
  pill: {
    height: 32.8,
    left: 11.08,
    right: 10.62,
    above: 11.9,
    bottom: 17.05,
    intoInset: 16.95,
    arrowInset: 15.15,
  },
} as const;

/**
 * The dates page (07, 24): the wordmark between the back chevron and the profile button, the destination's
 * photograph — the trip, `Travel dates` and what to do — then two months, the toggle where the dates may stay open,
 * `Preferred dates` and `Use these dates →` pinned at the foot. A whole page over the screen and its sheets: it opens
 * from the request sheet as from Explore's chips.
 */
export const DatesPage = forwardRef<DatesPageHandle, Props>(function DatesPage({ onUse, onFlexible }, ref) {
  const page = useRef<PageModalHandle>(null);
  const insets = useSafeAreaInsets();
  const { dismissAll } = useBottomSheetModal();
  const openTab = useOpenTab();
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
  // The design's own photograph of the city where it has one (ADR-IMPL-056), else the server's place photo.
  const picture = clubPhoto(trip.toCode, "any") ?? cardPicture(undefined, photoFor(trip.toCode), PICTURE_HEADERS);
  const pillBottom = Math.max(PAGE.pill.bottom, Math.round(insets.bottom) - PAGE.pill.intoInset);
  const footer = PAGE.pill.above + PAGE.pill.height + pillBottom;

  function use() {
    if (flexible) onFlexible?.();
    else if (sel && datesChosen(sel)) onUse(sel);
    else return;
    page.current?.dismiss();
  }

  // Leaving for Profile closes the page and every sheet under it (the request it may have opened from): nothing is
  // left standing over the tab.
  function toProfile() {
    dismissAll();
    openTab("profile");
  }

  return (
    <PageModal ref={page} testID="dates.root" onDismiss={() => setOpen(false)}>
      {/* The page is white: dark glyphs while it is up; the screen's own come back when it goes. */}
      {open ? <StatusBar style="dark" /> : null}
      <View style={[styles.head, { height: insets.top + PAGE.bar }]}>
        <View style={[styles.bar, { top: insets.top }]}>
          <TopBar
            look="dates"
            onBack={() => page.current?.dismiss()}
            backTestID="dates.close"
            right={
              <RoundButton
                icon="profile-user"
                accessibilityLabel="Profile"
                testID="dates.profile"
                tone="neutral"
                diameter={25.4}
                iconSize={14}
                onPress={toProfile}
              />
            }
          />
        </View>
      </View>
      <BottomSheetScrollView contentContainerStyle={{ paddingBottom: footer }}>
        <View style={styles.hero} accessible accessibilityRole="header" accessibilityLabel={`${title}. ${eyebrow}`}>
          <Photo source={picture} fallback={null} position={HERO_POSITION} style={StyleSheet.absoluteFill} />
          {/* Darker at the left and at the foot, where the words are — as 07's photograph is. */}
          <LinearGradient
            colors={[tokens.colors.photoVeil, tokens.colors.photoVeilClear]}
            locations={VEIL.side}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[StyleSheet.absoluteFill, { opacity: VEIL.sideOpacity }]}
            pointerEvents="none"
          />
          <LinearGradient
            colors={[tokens.colors.photoVeilClear, tokens.colors.photoVeil]}
            locations={VEIL.foot}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {eyebrow ? <Text style={[styles.eyebrow, { top: TOP.eyebrow }]}>{eyebrow}</Text> : null}
          <Text style={[styles.title, { top: TOP.title }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.sub, { top: TOP.sub }]}>
            Select your preferred travel dates{"\n"}for the best business class fares.
          </Text>
        </View>
        {sel ? (
          <View style={styles.calendar}>
            <Calendar
              key={opening}
              testID="dates.calendar"
              selection={sel}
              today={today}
              disabled={flexible}
              onSelect={(d) => setSel(selectDay(sel, d, today))}
            />
          </View>
        ) : null}
        {onFlexible ? (
          <View style={styles.flexible}>
            <Text style={[styles.rowTitle, styles.flexibleTitle]} numberOfLines={1}>
              Keep the dates flexible
            </Text>
            <Text style={[styles.rowBody, styles.flexibleBody]} numberOfLines={1}>
              Get better fares if your travel dates can be flexible.
            </Text>
            <View style={styles.toggle}>
              <Toggle
                testID="dates.flexible"
                accessibilityLabel="Keep the dates flexible"
                value={flexible}
                onChange={setFlexible}
              />
            </View>
            <View pointerEvents="none" style={styles.edge} />
          </View>
        ) : null}
        <View style={styles.preferred}>
          <View style={styles.preferredMark}>
            <Icon name="calendar-rings" size={PAGE.preferred.glyph} color={tokens.colors.textPrimary} />
          </View>
          <Text style={[styles.rowTitle, styles.preferredTitle]} numberOfLines={1}>
            Preferred dates
          </Text>
          <Text style={[styles.rowBody, styles.preferredBody]} numberOfLines={1}>
            Your specialist confirms availability.
          </Text>
        </View>
      </BottomSheetScrollView>
      <View style={[styles.footer, { height: footer, paddingBottom: pillBottom }]}>
        <Button
          testID="dates.use"
          label="Use these dates"
          variant="primary"
          height={PAGE.pill.height}
          text="buttonDates"
          trailing="arrow"
          trailingIcon="arrow-long"
          trailingSize={14}
          trailingAtEdge
          trailingInset={PAGE.pill.arrowInset}
          disabledColors={{ background: tokens.colors.pillDisabled, label: tokens.colors.textPillDisabled }}
          disabled={!ready}
          onPress={use}
          style={styles.pill}
        />
      </View>
    </PageModal>
  );
});

/**
 * london.webp through 07's frame: the whole width, from 30 % of what overflows (Big Ben whole, the river at the
 * foot). 07 draws its own photograph of Westminster, which the package does not hold; this is the package's London.
 */
const HERO_POSITION = { top: "30%" } as const;

/**
 * Two veils, fitted on 07's tones over london.webp: from the left (the veil at 80 % to clear at 70 % across) and
 * from the foot (clear above 35 %, the veil at the bottom), so the white words read as they do on 07.
 */
const VEIL = {
  side: [0, 0.7] as [number, number],
  sideOpacity: 0.8,
  foot: [0.35, 1] as [number, number],
};

/** Where each line's box starts for its baseline to fall where 07 draws it. */
const TOP = {
  eyebrow: PAGE.hero.text.eyebrow - baselineOffset(tokens.type.datesEyebrow),
  title: PAGE.hero.text.title - baselineOffset(tokens.type.datesTitle),
  sub:
    PAGE.hero.text.sub -
    baselineOffset({ fontSize: tokens.type.datesSub.fontSize, lineHeight: PAGE.hero.text.subPitch }),
  flexibleTitle: PAGE.flexible.title.baseline - baselineOffset(tokens.type.datesRowTitle),
  flexibleBody: PAGE.flexible.body.baseline - baselineOffset(tokens.type.datesRowBody),
  preferredTitle: PAGE.preferred.title.baseline - baselineOffset(tokens.type.datesRowTitle),
  preferredBody: PAGE.preferred.body.baseline - baselineOffset(tokens.type.datesRowBody),
};

const styles = StyleSheet.create({
  head: { backgroundColor: tokens.colors.surfacePage, zIndex: 1 },
  bar: { position: "absolute", left: 0, right: 0 },
  hero: {
    height: PAGE.hero.height,
    marginLeft: PAGE.hero.left,
    marginRight: PAGE.hero.right,
    borderRadius: PAGE.hero.radius,
    overflow: "hidden",
    backgroundColor: tokens.colors.surfaceTint,
    ...tokens.elevation.soft,
  },
  eyebrow: {
    ...rn(tokens.type.datesEyebrow),
    position: "absolute",
    left: PAGE.hero.text.eyebrowLeft,
    color: tokens.colors.textOnPhoto,
    textTransform: "uppercase",
  },
  title: {
    ...rn(tokens.type.datesTitle),
    position: "absolute",
    left: PAGE.hero.text.left,
    right: PAGE.hero.text.left,
    color: tokens.colors.textOnPhoto,
  },
  sub: {
    ...rn(tokens.type.datesSub),
    lineHeight: PAGE.hero.text.subPitch,
    position: "absolute",
    left: PAGE.hero.text.subLeft,
    right: PAGE.hero.text.left,
    color: tokens.colors.textOnPhoto,
  },
  calendar: { marginTop: PAGE.calendar.top, marginLeft: PAGE.card.left, marginRight: PAGE.card.right },
  flexible: {
    height: PAGE.flexible.height,
    marginTop: PAGE.flexible.top,
    marginLeft: PAGE.card.left,
    marginRight: PAGE.card.right,
    borderRadius: PAGE.card.radius,
    backgroundColor: tokens.colors.surfaceCard,
    ...tokens.elevation.soft,
  },
  // The card's hairline, drawn over its edge: it does not move what is measured from the card's corner.
  edge: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: PAGE.card.radius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.borderFaint,
  },
  rowTitle: { ...rn(tokens.type.datesRowTitle), position: "absolute", color: tokens.colors.textPrimary },
  rowBody: { ...rn(tokens.type.datesRowBody), position: "absolute", color: tokens.colors.textSecondary },
  flexibleTitle: { left: PAGE.flexible.title.left, right: 70, top: TOP.flexibleTitle },
  flexibleBody: { left: PAGE.flexible.body.left, right: 70, top: TOP.flexibleBody },
  toggle: { position: "absolute", right: PAGE.flexible.toggle.right, top: 0, bottom: 0, justifyContent: "center" },
  preferred: { height: PAGE.preferred.circle.size, marginTop: PAGE.preferred.top },
  preferredMark: {
    position: "absolute",
    left: PAGE.preferred.circle.left,
    width: PAGE.preferred.circle.size,
    height: PAGE.preferred.circle.size,
    borderRadius: PAGE.preferred.circle.size / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tokens.colors.datesMark,
  },
  preferredTitle: { left: PAGE.preferred.title.left, right: tokens.space.gutter, top: TOP.preferredTitle },
  preferredBody: { left: PAGE.preferred.body.left, right: tokens.space.gutter, top: TOP.preferredBody },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-end",
    paddingLeft: PAGE.pill.left,
    paddingRight: PAGE.pill.right,
    backgroundColor: tokens.colors.surfacePage,
  },
  pill: { ...tokens.elevation.soft },
});
