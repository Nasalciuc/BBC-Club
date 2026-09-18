import type { ReactNode } from "react";
import { StyleSheet } from "react-native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { tokens } from "../tokens";

/** Derived from content: field + chips + three FareRows ≈ 60% of 852. Module const — no useMemo. */
const SNAP_POINTS = ["35%", "60%", "100%"] as const;

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
