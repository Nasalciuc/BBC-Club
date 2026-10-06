import type { ReactNode } from "react";
import { StyleSheet } from "react-native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { tokens } from "../tokens";
import { HOME_SHEET_SNAPS } from "./home-sheet-snaps";

/** Derived from content: field + chips + three FareRows ≈ 60% of 852. Module const — no useMemo. */
const SNAP_POINTS = HOME_SHEET_SNAPS.map((f) => `${Math.round(f * 100)}%`);

type Props = {
  index: number;
  onChange: (index: number) => void;
  children: ReactNode;
};

/** BottomSheetScrollView, never ScrollView — content gesture must not fight the sheet. */
export function HomeSheet({ index, onChange, children }: Props) {
  return (
    <BottomSheet
      index={index}
      snapPoints={[...SNAP_POINTS]}
      // v5 sizes to content by default and inserts that height as an extra snap, shifting every index. Explore and the
      // globe read indices as HOME_SHEET_SNAPS: keep exactly these three.
      enableDynamicSizing={false}
      onChange={onChange}
      enablePanDownToClose={false}
      animationConfigs={{ damping: 30, stiffness: 260, mass: 1, overshootClamping: false }}
      handleIndicatorStyle={styles.handle}
      backgroundStyle={styles.background}
    >
      <BottomSheetScrollView contentContainerStyle={styles.content}>{children}</BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: tokens.colors.borderDefault },
  background: {
    backgroundColor: tokens.colors.surfacePage,
    borderTopLeftRadius: tokens.radius.panel,
    borderTopRightRadius: tokens.radius.panel,
  },
  content: { paddingHorizontal: tokens.space.lg, paddingBottom: tokens.space.xxl },
});
