import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { forwardRef, type ReactNode, useEffect, useImperativeHandle, useRef, useState } from "react";
import { BackHandler, Platform, StyleSheet, View } from "react-native";
import { tokens } from "../tokens";

export type PageModalHandle = { present: () => void; dismiss: () => void };

type Props = {
  children: ReactNode;
  /** On the page: Maestro and the e2e flows wait on it. */
  testID?: string;
  onDismiss?: () => void;
};

/**
 * A whole page over the screen and over its sheets (07: the dates page, opened from the request sheet as from
 * Explore). It rises like a sheet and covers the screen to its edges; no grabber, no drag — its own back button and
 * Android's Back close it. It lives where the sheets live (gorhom's portal), so it stacks above a sheet already open and
 * shares the screen's status bar.
 */
export const PageModal = forwardRef<PageModalHandle, Props>(function PageModal({ children, testID, onDismiss }, ref) {
  const modal = useRef<BottomSheetModal>(null);
  // From `present` until the page has gone: while it is open, Android's Back belongs to it.
  const [open, setOpen] = useState(false);
  useImperativeHandle(ref, () => ({
    present: () => {
      setOpen(true);
      modal.current?.present();
    },
    dismiss: () => modal.current?.dismiss(),
  }));

  // The listener added last answers first: the page closes before the sheet under it (ModalSheet's rule).
  useEffect(() => {
    if (Platform.OS !== "android" || !open) return;
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      modal.current?.dismiss();
      return true;
    });
    return () => back.remove();
  }, [open]);

  return (
    <BottomSheetModal
      ref={modal}
      snapPoints={FULL}
      enableDynamicSizing={false}
      enablePanDownToClose={false}
      enableHandlePanningGesture={false}
      enableContentPanningGesture={false}
      handleComponent={null}
      backgroundStyle={styles.background}
      stackBehavior="push"
      onDismiss={() => {
        setOpen(false);
        onDismiss?.();
      }}
    >
      {/* The page fills the sheet, as ModalSheet's does: its scroll takes what is left over its pinned foot. */}
      <View style={styles.page} testID={testID}>
        {children}
      </View>
    </BottomSheetModal>
  );
});

const FULL = ["100%"];

const styles = StyleSheet.create({
  background: { backgroundColor: tokens.colors.surfacePage, borderRadius: 0 },
  page: { flex: 1, backgroundColor: tokens.colors.surfacePage },
});
