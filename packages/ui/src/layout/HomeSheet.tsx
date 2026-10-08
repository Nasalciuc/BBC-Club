import { createContext, type ReactNode, useContext } from "react";
import { StyleSheet, View } from "react-native";
import BottomSheet, {
  BottomSheetFooter,
  type BottomSheetFooterProps,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { tokens } from "../tokens";
import { HOME_SHEET_SNAPS } from "./home-sheet-snaps";

/** Figma's 300 / 544 / 656 pt sheets on a 768 pt container (home-sheet-snaps). Module const — no useMemo. */
const SNAP_POINTS = HOME_SHEET_SNAPS.map((f) => `${Math.round(f * 100)}%`);

/** Figma HomeSheet · London selected: the pill sits 12 pt above the sheet's bottom edge, inside the 24 pt gutter. */
const FOOTER_HEIGHT = 56 + tokens.space.sm;

type Props = {
  index: number;
  onChange: (index: number) => void;
  children: ReactNode;
  /** Docked at the sheet's bottom edge, above the scrolling content (Figma: `Request a quote` on 89:387). */
  footer?: ReactNode;
};

// gorhom mounts `footerComponent` as a component type: a function created per render would remount the footer on every
// render. One module-level component reads the node from context instead.
const FooterContext = createContext<ReactNode>(null);

function DockedFooter(props: BottomSheetFooterProps) {
  const footer = useContext(FooterContext);
  return (
    <BottomSheetFooter {...props}>
      <View style={styles.footer}>{footer}</View>
    </BottomSheetFooter>
  );
}

/** BottomSheetScrollView, never ScrollView — content gesture must not fight the sheet. */
export function HomeSheet({ index, onChange, children, footer }: Props) {
  return (
    <FooterContext.Provider value={footer ?? null}>
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
        footerComponent={footer ? DockedFooter : undefined}
      >
        <BottomSheetScrollView contentContainerStyle={[styles.content, footer ? styles.contentAboveFooter : null]}>
          {children}
        </BottomSheetScrollView>
      </BottomSheet>
    </FooterContext.Provider>
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
  contentAboveFooter: { paddingBottom: FOOTER_HEIGHT + tokens.space.lg },
  footer: {
    paddingHorizontal: tokens.space.lg,
    paddingBottom: tokens.space.sm,
    backgroundColor: tokens.colors.surfacePage,
  },
});
