import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  type BottomSheetHandleProps,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetScrollViewMethods,
} from "@gorhom/bottom-sheet";
import { forwardRef, type ReactNode, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  BackHandler,
  Keyboard,
  type KeyboardEventName,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { ArtGlyph, Icon, type IconName } from "../icons";
import { CloseButton } from "../primitives/CloseButton";
import { baselineOffset, rn } from "../rn-type";
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
import { MODAL_SHEET_LOOKS, type ModalSheetLookName, sheetLookFooterBottom } from "./modal-sheet-looks";

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
  /**
   * False hides the × too — Figma 135:854: while a request is sending, the sheet has no way out until the answer. A
   * title's header is then its line alone, 24 pt, so the title rises 10 pt; the content stays where it was. A
   * headline keeps the ×'s place.
   */
  closable?: boolean;
  /**
   * False hides the × while the sheet still closes by its backdrop, a drag, Back and its own `Cancel` / `Not now` (35,
   * 25: a question with its answers in the sheet).
   */
  showClose?: boolean;
  /** `centre` for a question with an icon above it (25); otherwise the title at the left. */
  titleAlign?: "start" | "centre";
  /** Above a centred title: the question's own mark (25: the bell). */
  icon?: IconName;
  /**
   * The sheet's height, in points, where its size's would leave a short question floating in empty space (25: the
   * notifications question under its bell); never taller than the size's own.
   */
  height?: number;
  /**
   * The sheet as its screen draws it (`about`: 20) — its height, corners, grabber, ×, title, the words' column and the
   * pinned action, measured from the sheet's top (modal-sheet-looks). Without one, the 1.0 sizes.
   */
  look?: ModalSheetLookName;
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
    contentGap,
    scroll = true,
    insets = NO_INSETS,
    dismissible = true,
    closable = true,
    showClose = true,
    titleAlign = "start",
    icon,
    height,
    look: lookName,
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
  // From `present` until the sheet has gone: while it is open, Android's Back belongs to it.
  const [open, setOpen] = useState(false);
  useImperativeHandle(ref, () => ({
    present: () => {
      setOpen(true);
      modal.current?.present();
    },
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

  // Android's Back closes the sheet in front, as its × does, before it can leave the screen under it — and does
  // nothing while the sheet has no way out (a request sending, Figma 135:854) (ADR-IMPL-047). The listener added last
  // answers first, so a sheet opened over another one closes first. `closable` is read through a ref: the listener is
  // added once per opening and keeps its place, so a sheet under another one whose send ends does not move above it.
  const closableRef = useRef(closable);
  useEffect(() => {
    closableRef.current = closable;
  }, [closable]);
  useEffect(() => {
    if (Platform.OS !== "android" || !open) return;
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      if (closableRef.current) modal.current?.dismiss();
      return true;
    });
    return () => back.remove();
  }, [open]);

  const headline = modalSheetHeadline(size);
  const titleAlone = !closable && !headline;
  const headerBottom =
    HANDLE_AREA + (icon ? ICON_AREA : 0) + (headline ? HEADER_HEADLINE : titleAlone ? TITLE_LINE : HEADER_TITLE);
  const contentOffset = Math.max(0, (contentTop ?? modalSheetContentTop(size)) - headerBottom);
  const look = lookName ? MODAL_SHEET_LOOKS[lookName] : null;
  // A centred title that wraps (larger text, a longer question) makes the sheet taller by its extra lines (25).
  const [titleLines, setTitleLines] = useState(1);
  const grow = look?.title.align === "centre" ? (titleLines - 1) * look.title.role.lineHeight : 0;
  const sheetHeight =
    Math.min(modalSheetHeight(size, windowHeight), height ?? look?.height ?? Number.POSITIVE_INFINITY) + grow;

  return (
    <BottomSheetModal
      ref={modal}
      snapPoints={[sheetHeight]}
      enableDynamicSizing={false}
      enablePanDownToClose={dismissible}
      topInset={insets.top}
      stackBehavior={stackBehavior}
      onDismiss={() => {
        setOpen(false);
        onDismiss?.();
      }}
      backdropComponent={BACKDROPS[look?.scrim ?? "night"][dismissible ? "closing" : "still"]}
      handleComponent={look ? null : Handle}
      backgroundStyle={[
        styles.background,
        look ? { borderTopLeftRadius: look.radius, borderTopRightRadius: look.radius } : null,
      ]}
    >
      <InModalSheet.Provider value>
        {look ? (
          <View style={styles.sheet}>
            {/* The grabber, the title on its baseline and the × where the screen draws them, from the sheet's top. */}
            <View
              style={[
                styles.lookGrabber,
                {
                  top: look.grabber.top,
                  width: look.grabber.width,
                  height: look.grabber.height,
                  marginLeft: -look.grabber.width / 2,
                  borderRadius: look.grabber.height / 2,
                  backgroundColor: look.grabber.color,
                },
              ]}
              pointerEvents="none"
            />
            {look.mark ? (
              // The question's own mark (25: the bell), centred over the title.
              <View
                style={[styles.lookMark, { top: look.mark.top }]}
                pointerEvents="none"
                importantForAccessibility="no-hide-descendants"
              >
                <ArtGlyph art={look.mark.art} height={look.mark.height} color={look.mark.color} />
              </View>
            ) : null}
            <Text
              style={[
                look.title.role,
                styles.lookTitle,
                look.title.align === "centre" && styles.centred,
                {
                  marginTop: look.title.baseline - baselineOffset(look.title.role),
                  marginLeft: look.title.left,
                  marginRight: look.title.right,
                },
              ]}
              accessibilityRole="header"
              onTextLayout={
                look.title.align === "centre"
                  ? (e) => setTitleLines(Math.max(1, e.nativeEvent.lines.length))
                  : undefined
              }
            >
              {title}
            </Text>
            {showClose ? (
              // A sheet with no way out for now (23: sending) keeps its × in place, not pressable.
              <CloseButton
                testID={closeTestID}
                tone={look.close.tone ?? "tint"}
                diameter={look.close.diameter}
                glyph={look.close.glyph}
                disabled={!closable}
                onPress={() => modal.current?.dismiss()}
                style={StyleSheet.flatten([styles.lookClose, { top: look.close.top, right: look.close.right }])}
              />
            ) : null}
            <View
              ref={viewportRef}
              style={[
                styles.body,
                {
                  marginTop:
                    look.content.top -
                    (look.title.baseline - baselineOffset(look.title.role) + look.title.role.lineHeight),
                },
              ]}
              testID={scroll ? undefined : testID}
            >
              {scroll ? (
                <BottomSheetScrollView
                  ref={scrollRef}
                  style={styles.body}
                  contentContainerStyle={{
                    paddingLeft: look.content.left,
                    paddingRight: look.content.right,
                    paddingBottom: tokens.space.sm,
                    gap: contentGap ?? look.content.gap,
                  }}
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
              <SheetFooter
                bottom={sheetLookFooterBottom(look, insets.bottom)}
                style={{ paddingLeft: look.footer.left, paddingRight: look.footer.right, paddingTop: 0 }}
              >
                {footer}
              </SheetFooter>
            ) : null}
          </View>
        ) : (
          <View style={styles.sheet}>
            {icon ? (
              <View style={styles.icon} importantForAccessibility="no-hide-descendants">
                <Icon name={icon} size={32} color={tokens.colors.textPrimary} strokeWidth={1.75} />
              </View>
            ) : null}
            <View
              style={[
                styles.header,
                headline ? styles.headerHeadline : titleAlone ? styles.headerTitleAlone : styles.headerTitle,
                titleAlign === "centre" && !(closable && showClose) && styles.headerCentred,
              ]}
            >
              <Text
                style={[headline ? styles.headline : styles.title, titleAlign === "centre" && styles.centred]}
                accessibilityRole="header"
              >
                {title}
              </Text>
              {closable && showClose ? (
                <CloseButton
                  testID={closeTestID}
                  tone={size === "explain" ? "tint" : "plain"}
                  onPress={() => modal.current?.dismiss()}
                />
              ) : headline && showClose ? (
                <View style={styles.closePlace} />
              ) : null}
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
                  contentContainerStyle={[styles.content, { gap: contentGap ?? tokens.space.lg }]}
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
        )}
      </InModalSheet.Provider>
    </BottomSheetModal>
  );
});

/** The grabber (sheet 42): 40 × 5 at 10 pt from the top; the header starts 24 pt down. */
const HANDLE_AREA = 24;
const HEADER_TITLE = 44;
const HEADER_HEADLINE = 64;
/** The question's mark over its title (25): 32 pt, 12 above and under it. */
const ICON_AREA = 56;
/** A title's line (`title`, 20/24): its header while the × is hidden (Figma 135:854). */
const TITLE_LINE = 24;
const NO_INSETS = { top: 0, bottom: 0 };

/** The actions, pinned: Figma's distance above the sheet's edge — or, with the keyboard up, 12 pt over its keys. */
function SheetFooter({ bottom, style, children }: { bottom: number; style?: ViewStyle; children: ReactNode }) {
  const keyboard = useKeyboardShown();
  return (
    <View style={[styles.footer, style, { paddingBottom: keyboard ? MODAL_SHEET_KEYBOARD_GAP : bottom }]}>
      {children}
    </View>
  );
}

// The events gorhom's sheets follow: iOS tells when the keyboard starts to move, Android once it has. On iOS the `Did`
// events count too: the first state comes from `Keyboard.isVisible()`, which they set, so a sheet or a screen that
// mounts while the keys are still moving learns where they stopped (ADR-IMPL-047).
const KEYBOARD_EVENTS: readonly (readonly [KeyboardEventName, boolean])[] =
  Platform.OS === "ios"
    ? [
        ["keyboardWillShow", true],
        ["keyboardWillHide", false],
        ["keyboardDidShow", true],
        ["keyboardDidHide", false],
      ]
    : [
        ["keyboardDidShow", true],
        ["keyboardDidHide", false],
      ];

/** Whether the keyboard is up: a footer on the keys drops the home indicator's inset, which the keys already cover —
 *  the sheets' footer, and the entry's (`AuthShell`, ADR-IMPL-047). */
export function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    const subscriptions = KEYBOARD_EVENTS.map(([event, up]) => Keyboard.addListener(event, () => setShown(up)));
    return () => {
      for (const subscription of subscriptions) subscription.remove();
    };
  }, []);
  return shown;
}

/** The page dimmed under the sheet (`scrim`; 25's question and 35's deletion dim it darker). */
function NightBackdrop({
  pressBehavior,
  color,
  ...props
}: BottomSheetBackdropProps & { pressBehavior: "close" | "none"; color: string }) {
  return (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      opacity={1}
      pressBehavior={pressBehavior}
      style={[props.style, { backgroundColor: color }]}
    />
  );
}

// gorhom mounts `backdropComponent` as a component type: one created per render would remount on every render. The
// backdrops are made once, here — a tap closes the sheet, or (while a request or a save is in flight) does nothing.
function backdrops(color: string) {
  return {
    closing: function ClosingBackdrop(props: BottomSheetBackdropProps) {
      return <NightBackdrop {...props} pressBehavior="close" color={color} />;
    },
    still: function StillBackdrop(props: BottomSheetBackdropProps) {
      return <NightBackdrop {...props} pressBehavior="none" color={color} />;
    },
  };
}

const BACKDROPS = {
  night: backdrops(tokens.colors.scrim),
  question: backdrops(tokens.colors.scrimQuestion),
  delete: backdrops(tokens.colors.scrimDelete),
} as const;

function Handle(_props: BottomSheetHandleProps) {
  return (
    <View style={styles.handleArea}>
      <View style={styles.handle} />
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    backgroundColor: tokens.colors.surfaceCard,
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    ...tokens.elevation.sheet,
  },
  handleArea: { height: HANDLE_AREA, paddingTop: 10, alignItems: "center" },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: tokens.colors.borderDefault },
  sheet: { flex: 1 },
  icon: { height: ICON_AREA, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: tokens.space.xs, paddingLeft: tokens.space.gutter },
  headerTitle: { minHeight: HEADER_TITLE, paddingRight: tokens.space.sm },
  // The title keeps its box without the ×: it wraps where it did.
  headerTitleAlone: { minHeight: TITLE_LINE, paddingRight: tokens.space.sm + tokens.space.xs + 44 },
  headerHeadline: { minHeight: HEADER_HEADLINE, paddingRight: tokens.space.sm },
  centred: { textAlign: "center" },
  // A centred title with no × beside it: the same room on both sides.
  headerCentred: { paddingRight: tokens.space.gutter },
  title: { ...rn(tokens.type.title), color: tokens.colors.textPrimary, flex: 1 },
  headline: { ...rn(tokens.type.headline), color: tokens.colors.textPrimary, flex: 1 },
  // The ×'s 44-pt target, kept beside a headline while it is hidden.
  closePlace: { width: 44, height: 44 },
  body: { flex: 1 },
  content: { paddingHorizontal: tokens.space.gutter, paddingBottom: tokens.space.lg },
  footer: { paddingHorizontal: tokens.space.gutter, paddingTop: tokens.space.md, gap: tokens.space.sm },
  lookGrabber: { position: "absolute", left: "50%" },
  lookMark: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  lookTitle: { color: tokens.colors.textPrimary },
  lookClose: { position: "absolute" },
});
