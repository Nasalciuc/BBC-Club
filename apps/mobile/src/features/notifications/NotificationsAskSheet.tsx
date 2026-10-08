import { BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, CloseButton, tokens, rn } from "@bbc/ui";

import { registerPushDevice } from "@/lib/push";
import { appStorage, PUSH_ASKED_AT_KEY } from "@/lib/storage-keys";

export type NotificationsAskSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

const ASK_SNAP_POINTS = ["42%"];

function markAsked() {
  appStorage.set(PUSH_ASKED_AT_KEY, String(Date.now()));
}

/** Shown once, after the first request is received. Close is Not now. */
export const NotificationsAskSheet = forwardRef<NotificationsAskSheetHandle>(
  function NotificationsAskSheet(_props, ref) {
    const modalRef = useRef<BottomSheetModal>(null);

    useImperativeHandle(ref, () => ({
      present() {
        modalRef.current?.present();
      },
      dismiss() {
        modalRef.current?.dismiss();
      },
    }));

    function notNow() {
      markAsked();
      modalRef.current?.dismiss();
    }

    return (
      <BottomSheetModal
        ref={modalRef}
        snapPoints={ASK_SNAP_POINTS}
        stackBehavior="push"
        enablePanDownToClose
        onDismiss={markAsked}
        backgroundStyle={styles.bg}
        handleIndicatorStyle={styles.handle}
      >
        <BottomSheetScrollView contentContainerStyle={styles.content} testID="push-ask.root">
          <View style={styles.header}>
            <Text style={styles.title}>Know when your quote is ready.</Text>
            <CloseButton testID="push-ask.not-now" onPress={notNow} />
          </View>
          <Text style={styles.body}>
            We'll notify you once when your specialist has a quote. Nothing else unless you choose it.
          </Text>
          <Button
            testID="push-ask.turn-on"
            label="Turn on notifications"
            variant="primary"
            shape="card"
            onPress={() => {
              void (async () => {
                try {
                  await registerPushDevice({ prompt: true });
                  markAsked();
                  modalRef.current?.dismiss();
                } catch {
                  // The system dialog never appeared. Leave the sheet unmarked so the next request can ask.
                }
              })();
            }}
          />
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);

const styles = StyleSheet.create({
  bg: {
    backgroundColor: tokens.colors.surfacePage,
    borderTopLeftRadius: tokens.radius.panel,
    borderTopRightRadius: tokens.radius.panel,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: tokens.colors.borderDefault },
  content: { paddingHorizontal: tokens.space.lg, paddingBottom: tokens.space.xxl, gap: tokens.space.md },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: tokens.space.sm },
  title: { ...rn(tokens.type.title), color: tokens.colors.textPrimary, flex: 1 },
  body: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
});
