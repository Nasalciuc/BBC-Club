import { createContext, type ReactNode, useContext, useRef } from "react";
import { StyleSheet, View } from "react-native";
import BottomSheet, {
  type BottomSheetBackgroundProps,
  BottomSheetFooter,
  type BottomSheetFooterProps,
  type BottomSheetHandleProps,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { Extrapolation, interpolate, useAnimatedStyle } from "react-native-reanimated";

import { tokens } from "../tokens";

/** 13: the pill sits 12 pt above the sheet's bottom edge, inside the gutter. */
const FOOTER_HEIGHT = 52 + tokens.space.sm;

/** The grabber's band (13, 16): the grabber 11 pt from the sheet's top, 40 × 5; the content starts under it. */
export const HOME_SHEET_HANDLE = 16;

type Props = {
  index: number;
  onChange: (index: number) => void;
  /** The sheet's three heights, in points, lowest first: at rest (02), a chosen route (13), every offer (16). */
  snapPoints: readonly [number, number, number];
  children: ReactNode;
  /** Docked at the sheet's bottom edge, above the scrolling content (13: `Request a quote`). */
  footer?: ReactNode;
  testID?: string;
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

/** How far the sheet is from rest toward its next stop: 0 at rest (02, no card), 1 from halfway up (13, 16). */
function cardness(index: number) {
  "worklet";
  return interpolate(index, [0, 0.5], [0, 1], Extrapolation.CLAMP);
}

/**
 * At rest (02) the sheet is no card: the search bar floats over the globe's foot and the offers sit on the page, the
 * sky fading into it behind the bar. Raised (13, 16) it is the white sheet with its 24-pt corners and its shadow.
 */
function SheetBackground({ animatedIndex, style, pointerEvents }: BottomSheetBackgroundProps) {
  const card = useAnimatedStyle(() => ({ opacity: cardness(animatedIndex.value) }));
  return (
    <View style={style} pointerEvents={pointerEvents}>
      <View style={StyleSheet.absoluteFill}>
        <LinearGradient colors={[`${tokens.colors.surfacePage}00`, tokens.colors.surfacePage]} style={styles.haze} />
        <View style={styles.page} />
      </View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.card, card]} />
    </View>
  );
}

function SheetHandle({ animatedIndex }: BottomSheetHandleProps) {
  const shown = useAnimatedStyle(() => ({ opacity: cardness(animatedIndex.value) }));
  return (
    <View style={styles.handleArea}>
      <Animated.View style={[styles.handle, shown]} />
    </View>
  );
}

/** Explore's sheet over the globe, at three stops (02, 13, 16). BottomSheetScrollView, never ScrollView — the content's
 *  gesture must not fight the sheet's. */
export function HomeSheet({ index, onChange, snapPoints, children, footer, testID }: Props) {
  const sheet = useRef<BottomSheet>(null);
  // The sheet is never closed: three stops and no pan down to close. The library says -1 when a snap lands on none
  // of them — its target moved while it ran, as the screen's height settles after its first layout — and passing
  // that on closed the sheet for good: the screen's index became -1 and nothing raised it again (Android parity on
  // #80: Explore without its search bar). The sheet goes back to the stop the screen asked for instead.
  function settle(next: number) {
    if (next >= 0) onChange(next);
    else sheet.current?.snapToIndex(index);
  }
  return (
    <FooterContext.Provider value={footer ?? null}>
      <BottomSheet
        ref={sheet}
        index={index}
        snapPoints={[...snapPoints]}
        // v5 sizes to content by default and inserts that height as an extra snap, shifting every index: keep exactly
        // these three.
        enableDynamicSizing={false}
        onChange={settle}
        // The index follows a snap as it starts, not only when it lands: a city chosen while a dragged sheet is still
        // settling must find the index already down, or raising it again would change nothing.
        onAnimate={(_from, to) => settle(to)}
        enablePanDownToClose={false}
        animationConfigs={{ damping: 30, stiffness: 260, mass: 1, overshootClamping: false }}
        handleComponent={SheetHandle}
        backgroundComponent={SheetBackground}
        footerComponent={footer ? DockedFooter : undefined}
      >
        <BottomSheetScrollView
          testID={testID}
          contentContainerStyle={[styles.content, footer ? styles.contentAboveFooter : null]}
        >
          {children}
        </BottomSheetScrollView>
      </BottomSheet>
    </FooterContext.Provider>
  );
}

const styles = StyleSheet.create({
  handleArea: { height: HOME_SHEET_HANDLE, alignItems: "center", paddingTop: 11 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: tokens.colors.borderDefault },
  // 02: the sky fades into the page behind the search bar, then the page.
  haze: { height: 72 },
  page: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  card: {
    backgroundColor: tokens.colors.surfaceCard,
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    ...tokens.elevation.sheet,
  },
  content: { paddingHorizontal: tokens.space.gutter, paddingBottom: tokens.space.xxxl },
  contentAboveFooter: { paddingBottom: FOOTER_HEIGHT + tokens.space.lg },
  footer: {
    paddingHorizontal: tokens.space.gutter,
    paddingBottom: tokens.space.sm,
    backgroundColor: tokens.colors.surfaceCard,
  },
});
