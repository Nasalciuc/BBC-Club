import { BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  Button,
  Calendar,
  CloseButton,
  ctaLabel,
  rn,
  selectDay,
  sheetTitle,
  short,
  todayLocal,
  tokens,
  type Selection,
} from "@bbc/ui";

export type DatesSheetHandle = { present: (s: Selection) => void };

const DATE_SNAP_POINTS = ["92%"] as const;

type Props = {
  onUse: (s: Selection) => void;
  /** Home only: the way back to `Oct · flexible` — an undated search, the one that can carry an estimate. */
  onFlexible?: () => void;
};

export const DatesSheet = forwardRef<DatesSheetHandle, Props>(function DatesSheet({ onUse, onFlexible }, ref) {
  const modal = useRef<BottomSheetModal>(null);
  const [sel, setSel] = useState<Selection | null>(null);
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
    <BottomSheetModal
      ref={modal}
      snapPoints={[...DATE_SNAP_POINTS]}
      stackBehavior="push"
      enableDynamicSizing={false}
      backgroundStyle={styles.bg}
      handleIndicatorStyle={styles.handle}
    >
      <View style={styles.sheet}>
        <View style={styles.header} testID="dates.root">
          <Text style={styles.title}>{title}</Text>
          <CloseButton testID="dates.close" onPress={() => modal.current?.dismiss()} />
        </View>
        {sel ? (
          <View style={styles.legs}>
            <DatePill
              testID="dates.depart"
              label="DEPART"
              value={sel.depart ? short(sel.depart) : "Select date"}
              active={sel.editing === "depart"}
              onPress={() => setSel({ ...sel, editing: "depart" })}
            />
            <DatePill
              testID="dates.return"
              label="RETURN"
              value={sel.tripType === "oneway" ? "" : sel.ret ? short(sel.ret) : "Select date"}
              active={sel.tripType === "round" && sel.editing === "return"}
              disabled={sel.tripType === "oneway" || !sel.depart}
              onPress={() => setSel({ ...sel, editing: "return" })}
            />
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
        <View style={styles.footer}>
          <Button
            testID="dates.use"
            label={cta.label}
            disabled={!cta.enabled}
            variant="primary"
            shape="pill"
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
        </View>
      </View>
    </BottomSheetModal>
  );
});

function DatePill({
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
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.pill, active && styles.pillActive]}
    >
      <Text style={styles.pillLabel}>{label}</Text>
      <Text style={styles.pillValue}>{value}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bg: {
    backgroundColor: tokens.colors.surfacePage,
    borderTopLeftRadius: tokens.radius.panel,
    borderTopRightRadius: tokens.radius.panel,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: tokens.colors.borderDefault },
  sheet: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: tokens.space.lg,
    marginBottom: tokens.space.md,
  },
  title: { ...rn(tokens.type.title), color: tokens.colors.textPrimary },
  scroll: { paddingHorizontal: tokens.space.lg, paddingBottom: tokens.space.lg },
  footer: { paddingHorizontal: tokens.space.lg, paddingBottom: tokens.space.lg, gap: tokens.space.xs },
  note: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary },
  flexible: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  flexiblePressed: { opacity: 0.6 },
  flexibleLabel: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  legs: {
    flexDirection: "row",
    gap: tokens.space.sm,
    paddingHorizontal: tokens.space.lg,
    marginBottom: tokens.space.md,
  },
  pill: {
    flex: 1,
    gap: tokens.space.xxs,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.field,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
  },
  pillActive: { borderColor: tokens.colors.actionPrimary },
  pillLabel: { ...rn(tokens.type.labelMono), color: tokens.colors.textSecondary },
  pillValue: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
});
