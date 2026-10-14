import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  type BottomSheetHandleProps,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetScrollViewMethods,
} from "@gorhom/bottom-sheet";
import { forwardRef, type ReactNode, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Keyboard, Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { CloseButton } from "../primitives/CloseButton";
import { rn } from "../rn-type";
import { tokens } from "../tokens";
import { InModalSheet } from "./in-modal-sheet";
import {
  MODAL_SHEET_KEYBOARD_GAP,
  modalSheetContentTop,
  modalSheetFooterBottom,
  modalSheetHeadline,
  modalSheetHeight,
  type ModalSheetSize,
  revealScroll,
} from "./modal-sheet-sizes";

/** What the sheet can bring into view: an error, or the block of the field at fault with its error. */
type Revealable = Pick<View, "measureInWindow">;

export type ModalSheetHandle = {
  present: () => void;
  dismiss: () => void;
  /**
   * Scrolls the content just enough that `target` shows whole, clear of the pinned actions and of the keyboard;
   * nothing moves when it shows already. Called once a message appears (an effect on the message), never on a layout.
   */
  reveal: (target: Revealable | null) => void;
};

type Props = {
  title: string;
  /** Which of Figma's sheets (modal-sheet-sizes): `tall` by default. */
  size?: ModalSheetSize;
  closeTestID: string;
  /** On the content: Maestro and the e2e flows wait on it. */
  testID?: string;
  children: ReactNode;
  /** Figma's Sheet actions: pinned at the bottom, above the home indicator, never scrolled away. */
  footer?: ReactNode;
  /** From the last action's bottom edge to the sheet's, on Figma's frame, when the sheet differs from its size's. */
  footerBottom?: number;
  /** Where the content starts from the sheet's top, on Figma's frame, when the sheet differs from its size's. */
  contentTop?: number;
  /** Space between the content's blocks: Figma's sheets set them 24 apart. */
  contentGap?: number;
  /** False when the sheet lays out its own scroll (the calendar under its fixed dates). */
  scroll?: boolean;
  /**
   * The screen's safe-area insets: a sheet the keyboard raises stops under the status bar, and the actions stay clear
   * of the home indicator or navigation bar.
   */
  insets?: { top: number; bottom: number };
  /** False while a request or a save is in flight: no drag down, no tap on the backdrop. The × still closes. */
  dismissible?: boolean;
  stackBehavior?: "push" | "replace" | "switch";
  onDismiss?: () => void;
};

/**
 * Figma's modal sheet (135:849, 238:4561, 320:5969 …): the page under a 35% night backdrop; the sheet in `surface-page`
 * with 24-pt top corners and a 48 × 4 handle; its title and the filled × 24 pt below the top; the content in the 24-pt
 * gutters; the actions pinned at the bottom.
 *
 * Figma lays the header out as the title's box, 8 pt, then the × — 257 pt then the × on a title, 281 on a headline — so
 * the × stands 36 pt (12 on a headline) inside the gutter rather than at its edge. The sheet keeps those measures.
 *
 * With the keyboard up, the sheet rises above it (a field inside is gorhom's input: `InModalSheet`) and its actions
 * stand 12 pt over the keys.
 */
export const ModalSheet = forwardRef<ModalSheetHandle, Props>(function ModalSheet(
  {
    title,
    size = "tall",
    closeTestID,
    testID,
    children,
    footer,
    footerBottom,
    contentTop,
    contentGap = tokens.space.lg,
    scroll = true,
    insets = NO_INSETS,
    dismissible = true,
    stackBehavior,
    onDismiss,
  },
  ref,
) {
  const modal = useRef<BottomSheetModal>(null);
  const scrollRef = useRef<BottomSheetScrollViewMethods>(null);
  const viewportRef = useRef<View>(null);
  // The content's scroll, as the scroll view reports it: `reveal` moves from there.
  const offset = useRef(0);
  const { height: windowHeight } = useWindowDimensions();
  useImperativeHandle(ref, () => ({
    present: () => modal.current?.present(),
    dismiss: () => modal.current?.dismiss(),
    reveal: (target) => {
      const viewport = viewportRef.current;
      if (!target || !viewport) return;
      viewport.measureInWindow((_vx, viewportTop, _vw, viewportHeight) => {
        target.measureInWindow((_x, top, _w, height) => {
          const y = revealScroll({ top: top - viewportTop, height }, viewportHeight, offset.current);
          if (y != null) scrollRef.current?.scrollTo({ y, animated: true });
        });
      });
    },
  }));

  const headline = modalSheetHeadline(size);
  const headerBottom = HANDLE_AREA + (headline ? HEADER_HEADLINE : HEADER_TITLE);
  const contentOffset = Math.max(0, (contentTop ?? modalSheetContentTop(size)) - headerBottom);

  return (
    <BottomSheetModal
      ref={modal}
      snapPoints={[modalSheetHeight(size, windowHeight)]}
      enableDynamicSizing={false}
      enablePanDownToClose={dismissible}
      topInset={insets.top}
      stackBehavior={stackBehavior}
      onDismiss={onDismiss}
      backdropComponent={dismissible ? ClosingBackdrop : StillBackdrop}
      handleComponent={Handle}
      backgroundStyle={styles.background}
    >
      <InModalSheet.Provider value>
        <View style={styles.sheet}>
          <View style={[styles.header, headline ? styles.headerHeadline : styles.headerTitle]}>
            <Text style={headline ? styles.headline : styles.title} accessibilityRole="header">
              {title}
            </Text>
            <CloseButton testID={closeTestID} onPress={() => modal.current?.dismiss()} />
          </View>
          <View
            ref={viewportRef}
            style={[styles.body, { marginTop: contentOffset }]}
            testID={scroll ? undefined : testID}
          >
            {scroll ? (
              <BottomSheetScrollView
                ref={scrollRef}
                style={styles.body}
                contentContainerStyle={[styles.content, { gap: contentGap }]}
                keyboardShouldPersistTaps="handled"
                onScroll={(e) => {
                  offset.current = e.nativeEvent.contentOffset.y;
                }}
                testID={testID}
              >
                {children}
              </BottomSheetScrollView>
            ) : (
              children
            )}
          </View>
          {footer ? (
            <SheetFooter bottom={modalSheetFooterBottom(size, insets.bottom, windowHeight, footerBottom)}>
              {footer}
            </SheetFooter>
          ) : null}
        </View>
      </InModalSheet.Provider>
    </BottomSheetModal>
  );
});

/** Figma's handle: 48 × 4 at 8 pt from the top; the header starts 24 pt down. */
const HANDLE_AREA = 24;
const HEADER_TITLE = 44;
const HEADER_HEADLINE = 64;
const NO_INSETS = { top: 0, bottom: 0 };

/** The actions, pinned: Figma's distance above the sheet's edge — or, with the keyboard up, 12 pt over its keys. */
function SheetFooter({ bottom, children }: { bottom: number; children: ReactNode }) {
  const keyboard = useKeyboardShown();
  return (
    <View style={[styles.footer, { paddingBottom: keyboard ? MODAL_SHEET_KEYBOARD_GAP : bottom }]}>{children}</View>
  );
}

// The events gorhom's sheets follow: iOS tells when the keyboard starts to move, Android once it has.
const KEYBOARD_SHOW = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
const KEYBOARD_HIDE = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener(KEYBOARD_SHOW, () => setShown(true));
    const hide = Keyboard.addListener(KEYBOARD_HIDE, () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}

// gorhom mounts `backdropComponent` as a component type: one created per render would remount on every render. Two
// module-level backdrops instead — a tap closes the sheet, or (while a request or a save is in flight) does nothing.
function ClosingBackdrop(props: BottomSheetBackdropProps) {
  return <NightBackdrop {...props} pressBehavior="close" />;
}

function StillBackdrop(props: BottomSheetBackdropProps) {
  return <NightBackdrop {...props} pressBehavior="none" />;
}

/** Figma's backdrop: `surface-night` at 35% over the page. */
function NightBackdrop({ pressBehavior, ...props }: BottomSheetBackdropProps & { pressBehavior: "close" | "none" }) {
  return (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      opacity={0.35}
      pressBehavior={pressBehavior}
      style={[props.style, styles.backdrop]}
    />
  );
}

function Handle(_props: BottomSheetHandleProps) {
  return (
    <View style={styles.handleArea}>
      <View style={styles.handle} />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: tokens.colors.surfaceNight },
  background: {
    backgroundColor: tokens.colors.surfacePage,
    borderTopLeftRadius: tokens.radius.panel,
    borderTopRightRadius: tokens.radius.panel,
  },
  handleArea: { height: HANDLE_AREA, paddingTop: tokens.space.xs, alignItems: "center" },
  handle: { width: 48, height: 4, borderRadius: 2, backgroundColor: tokens.colors.borderDefault },
  sheet: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: tokens.space.xs, paddingLeft: tokens.space.lg },
  headerTitle: { minHeight: HEADER_TITLE, paddingRight: tokens.space.lg + 36 },
  headerHeadline: { minHeight: HEADER_HEADLINE, paddingRight: tokens.space.lg + 12 },
  title: { ...rn(tokens.type.title), color: tokens.colors.textPrimary, flex: 1 },
  headline: { ...rn(tokens.type.headline), color: tokens.colors.textPrimary, flex: 1 },
  body: { flex: 1 },
  content: { paddingHorizontal: tokens.space.lg, paddingBottom: tokens.space.lg },
  footer: { paddingHorizontal: tokens.space.lg, paddingTop: tokens.space.md, gap: tokens.space.sm },
});
