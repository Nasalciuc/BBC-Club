import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Button,
  Calendar,
  ctaLabel,
  ModalSheet,
  type ModalSheetHandle,
  rn,
  selectDay,
  sheetTitle,
  short,
  todayLocal,
  tokens,
  type Selection,
} from "@bbc/ui";

export type DatesSheetHandle = { present: (s: Selection) => void };

type Props = {
  onUse: (s: Selection) => void;
  /** Home only: the way back to `Oct · flexible` — an undated search, the one that can carry an estimate. */
  onFlexible?: () => void;
};

export const DatesSheet = forwardRef<DatesSheetHandle, Props>(function DatesSheet({ onUse, onFlexible }, ref) {
  const modal = useRef<ModalSheetHandle>(null);
  const [sel, setSel] = useState<Selection | null>(null);
  // The sheet runs to the screen's bottom edge, under Android's navigation bar: the footer keeps its last line above it.
  const insets = useSafeAreaInsets();
  const today = todayLocal();
  useImperativeHandle(ref, () => ({
    present: (s) => {
      setSel(s);
      modal.current?.present();
    },
  }));
  const cta = sel ? ctaLabel(sel) : { label: "Use these dates", enabled: false };
  const title = sel ? sheetTitle(sel) : "Departure date";
  return (
    // Figma 325:5878: the tall sheet; the chosen dates fixed under the title, the months scrolling under them, the
    // button and its guidance pinned 102 pt above the bottom edge — less on a shorter phone, where the months keep
    // their room.
    <ModalSheet
      ref={modal}
      title={title}
      closeTestID="dates.close"
      testID="dates.root"
      scroll={false}
      footerBottom={102}
      insets={insets}
      stackBehavior="push"
      footer={
        <>
          <Button
            testID="dates.use"
            label={cta.label}
            disabled={!cta.enabled}
            variant="primary"
            onPress={() => {
              if (sel) {
                onUse(sel);
                modal.current?.dismiss();
              }
            }}
          />
          {onFlexible ? (
            <Pressable
              testID="dates.flexible"
              accessibilityRole="button"
              accessibilityLabel="Keep the dates flexible"
              hitSlop={8}
              onPress={() => {
                onFlexible();
                modal.current?.dismiss();
              }}
              style={({ pressed }) => [styles.flexible, pressed && styles.flexiblePressed]}
            >
              <Text style={styles.flexibleLabel}>Keep the dates flexible</Text>
            </Pressable>
          ) : null}
          <Text style={styles.note}>Preferred dates. Your specialist confirms availability.</Text>
        </>
      }
    >
      {sel ? (
        // Figma 325:6505: the chosen dates as words, DEPART and RETURN side by side; one way shows DEPART alone (325:7161).
        <View style={styles.legs}>
          <DateValue
            testID="dates.depart"
            label="DEPART"
            value={sel.depart ? short(sel.depart) : "Select date"}
            active={sel.editing === "depart"}
            onPress={() => setSel({ ...sel, editing: "depart" })}
          />
          {sel.tripType === "round" ? (
            <DateValue
              testID="dates.return"
              label="RETURN"
              value={sel.ret ? short(sel.ret) : "Select date"}
              active={sel.editing === "return"}
              disabled={!sel.depart}
              onPress={() => setSel({ ...sel, editing: "return" })}
            />
          ) : null}
        </View>
      ) : null}
      <BottomSheetScrollView contentContainerStyle={styles.scroll}>
        {sel ? (
          <Calendar
            testID="dates.calendar"
            selection={sel}
            today={today}
            onSelect={(d) => setSel(selectDay(sel, d, today))}
          />
        ) : null}
      </BottomSheetScrollView>
    </ModalSheet>
  );
});

/** A chosen date as Figma writes it: the mono label, the day 8 pt under it. A tap picks which date the calendar sets. */
function DateValue({
  testID,
  label,
  value,
  active,
  disabled,
  onPress,
}: {
  testID: string;
  label: string;
  value: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      accessibilityState={{ selected: active, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.date, pressed && styles.datePressed]}
    >
      <Text style={styles.dateLabel}>{label}</Text>
      <Text style={styles.dateValue}>{value}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: tokens.space.lg, paddingBottom: tokens.space.lg },
  note: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary },
  flexible: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  flexiblePressed: { opacity: 0.6 },
  flexibleLabel: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  // 325:6515: the two dates 16 pt apart; the months start 33 pt under them (168 on the sheet).
  legs: {
    flexDirection: "row",
    gap: tokens.space.md,
    paddingHorizontal: tokens.space.lg,
    marginBottom: 33,
  },
  date: { flex: 1, gap: tokens.space.xs },
  datePressed: { opacity: 0.6 },
  dateLabel: { ...rn(tokens.type.labelMono), color: tokens.colors.textSecondary },
  dateValue: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
});
