import { createContext, type ReactNode, type RefObject, useContext, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import BottomSheet, {
  type BottomSheetBackgroundProps,
  BottomSheetFooter,
  type BottomSheetFooterProps,
  type BottomSheetHandleProps,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue } from "react-native-reanimated";

import { tokens } from "../tokens";
import { SHEET_TRACE, useSheetTrace } from "./useSheetTrace";

/** 13: `Request a quote`, 40.6 tall, 16.4 and 16.8 from the edges, its foot 13.9 over the sheet's bottom edge (the tab
 *  bar's top, its hairline included). */
const FOOTER = { pill: 40.6, left: 16.4, right: 16.8, bottom: 13.9 } as const;
const FOOTER_HEIGHT = FOOTER.pill + FOOTER.bottom;
/** The docked pill's height (13), for the screen's `Button`. */
export const HOME_SHEET_PILL = FOOTER.pill;

/** The grabber's band (13, 16): the content starts 16 pt under the sheet's top. */
export const HOME_SHEET_HANDLE = 16;

/**
 * The raised sheet as each stop draws it: a chosen route (13) with 26-pt corners and its grabber 41.5 × 4.4, 9.1 under
 * the top; every offer (16) with 22-pt corners and the grabber 48.4 × 4.2, 11.3 under it.
 */
const RAISED = {
  route: { radius: 26, grabber: { width: 41.5, height: 4.4, top: 9.1 } },
  all: { radius: 22, grabber: { width: 48.4, height: 4.2, top: 11.3 } },
} as const;
const LookContext = createContext<(typeof RAISED)[keyof typeof RAISED]>(RAISED.route);

type Props = {
  index: number;
  onChange: (index: number) => void;
  /** The sheet's three heights, in points, lowest first: at rest (02), a chosen route (13), every offer (16). */
  snapPoints: readonly [number, number, number];
  children: ReactNode;
  /** Docked at the sheet's bottom edge, above the scrolling content (13: `Request a quote`). */
  footer?: ReactNode;
  /**
   * In the grabber's band, beside the grabber and over the content's top (16: `Done`, whose words stand partly above
   * where the scrolling content starts). The screen places it; it does not scroll.
   */
  accessory?: ReactNode;
  /**
   * When the hosting screen is on screen. Coming back, the sheet is snapped to `index` again: it moves only if gorhom's
   * position strayed from that stop while the screen was away, since gorhom skips a snap to the stop it holds. It never
   * redrew the sheet parity found gone after a tab switch — gorhom held that one at rest; its drawn style was what was
   * lost (see HomeSheet). e2e builds log the sheet's state while the screen is on screen (useSheetTrace).
   */
  active?: boolean;
  testID?: string;
};
const AccessoryContext = createContext<ReactNode>(null);
/** e2e builds: the sheet's background, measured to see where the sheet is drawn (useSheetTrace). Null otherwise. */
const DrawnContext = createContext<RefObject<View | null> | null>(null);

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
 * sky fading into it behind the bar. Raised it is the white sheet with its shadow: 26-pt corners on a route (13), 22
 * over every offer (16).
 */
function SheetBackground({ animatedIndex, style, pointerEvents }: BottomSheetBackgroundProps) {
  const card = useAnimatedStyle(() => ({ opacity: cardness(animatedIndex.value) }));
  const look = useContext(LookContext);
  const drawn = useContext(DrawnContext);
  return (
    <View ref={drawn ?? undefined} style={style} pointerEvents={pointerEvents}>
      <View style={StyleSheet.absoluteFill}>
        <LinearGradient colors={[`${tokens.colors.surfacePage}00`, tokens.colors.surfacePage]} style={styles.haze} />
        <View style={styles.page} />
      </View>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.card,
          { borderTopLeftRadius: look.radius, borderTopRightRadius: look.radius },
          card,
        ]}
      />
    </View>
  );
}

function SheetHandle({ animatedIndex }: BottomSheetHandleProps) {
  const shown = useAnimatedStyle(() => ({ opacity: cardness(animatedIndex.value) }));
  const { grabber } = useContext(LookContext);
  const accessory = useContext(AccessoryContext);
  return (
    <View style={styles.handleArea}>
      <Animated.View
        style={[
          styles.handle,
          { width: grabber.width, height: grabber.height, marginTop: grabber.top, borderRadius: grabber.height / 2 },
          shown,
        ]}
      />
      {accessory}
    </View>
  );
}

/**
 * Explore's sheet over the globe, at three stops (02, 13, 16). BottomSheetScrollView, never ScrollView — the content's
 * gesture must not fight the sheet's.
 *
 * gorhom draws the whole sheet in one Animated.View whose first frame is a window height down and, on Android,
 * transparent. At rest nothing writes that style again, so the sheet stays drawn only while Reanimated keeps the last
 * props it wrote: Reanimated 4.5.1's settled-props sync could erase them before React had them, and the next React
 * commit drew the first frame — Explore without its sheet while gorhom held it at rest (parity). That sync is off
 * (design/motion.md, resting styles). `[...snapPoints]` keeps its identity between renders: the React Compiler memoizes
 * it on `snapPoints`, as it does Explore's `sheetSnaps(height, top)`.
 */
export function HomeSheet({ index, onChange, snapPoints, children, footer, accessory, active = true, testID }: Props) {
  const sheet = useRef<BottomSheet>(null);
  // e2e builds only: gorhom writes its index and position here, and the background is measured (useSheetTrace).
  const traceIndex = useSharedValue(-1);
  const tracePosition = useSharedValue(0);
  const drawn = useRef<View>(null);
  useSheetTrace(active, index, drawn, traceIndex, tracePosition);
  // The sheet is never closed: three stops and no pan down to close. The library says -1 when a snap lands on none
  // of them — its target moved while it ran, as the screen's height settles after its first layout — and passing
  // that on closed the sheet for good: the screen's index became -1 and nothing raised it again (Android parity on
  // #80: Explore without its search bar). The sheet goes back to the stop the screen asked for instead.
  function settle(next: number) {
    if (next >= 0) onChange(next);
    else sheet.current?.snapToIndex(index);
  }
  // Coming back, the stop is asked for again: gorhom moves only if its position strayed while the screen was away (a
  // snap to the stop it holds is skipped, so this cannot redraw a sheet whose drawn style was lost — see above).
  useEffect(() => {
    if (active) sheet.current?.snapToIndex(index);
  }, [active, index]);
  return (
    <LookContext.Provider value={index >= 2 ? RAISED.all : RAISED.route}>
      <AccessoryContext.Provider value={accessory ?? null}>
        <FooterContext.Provider value={footer ?? null}>
          <DrawnContext.Provider value={SHEET_TRACE ? drawn : null}>
            <BottomSheet
              ref={sheet}
              index={index}
              snapPoints={[...snapPoints]}
              // v5 sizes to content by default and inserts that height as an extra snap, shifting every index: keep
              // exactly these three.
              enableDynamicSizing={false}
              onChange={settle}
              // The index follows a snap as it starts, not only when it lands: a city chosen while a dragged sheet is
              // still settling must find the index already down, or raising it again would change nothing.
              onAnimate={(_from, to) => settle(to)}
              enablePanDownToClose={false}
              animationConfigs={{ damping: 30, stiffness: 260, mass: 1, overshootClamping: false }}
              handleComponent={SheetHandle}
              backgroundComponent={SheetBackground}
              footerComponent={footer ? DockedFooter : undefined}
              animatedIndex={SHEET_TRACE ? traceIndex : undefined}
              animatedPosition={SHEET_TRACE ? tracePosition : undefined}
            >
              <BottomSheetScrollView
                testID={testID}
                contentContainerStyle={[styles.content, footer ? styles.contentAboveFooter : null]}
              >
                {children}
              </BottomSheetScrollView>
            </BottomSheet>
          </DrawnContext.Provider>
        </FooterContext.Provider>
      </AccessoryContext.Provider>
    </LookContext.Provider>
  );
}

const styles = StyleSheet.create({
  handleArea: { height: HOME_SHEET_HANDLE, alignItems: "center", zIndex: 1 },
  handle: { backgroundColor: tokens.colors.grabber },
  // 02: the sky fades into the page behind the search bar, then the page.
  haze: { height: 72 },
  page: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  card: { backgroundColor: tokens.colors.surfaceCard, ...tokens.elevation.sheet },
  content: { paddingHorizontal: tokens.space.gutter, paddingBottom: tokens.space.xxxl },
  contentAboveFooter: { paddingBottom: FOOTER_HEIGHT + tokens.space.lg },
  footer: {
    paddingLeft: FOOTER.left,
    paddingRight: FOOTER.right,
    paddingBottom: FOOTER.bottom,
    backgroundColor: tokens.colors.surfaceCard,
  },
});
