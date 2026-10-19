import { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, ModalSheet, type ModalSheetHandle, TextButton, tokens } from "@bbc/ui";

import { registerPushDevice } from "@/lib/push";
import { appStorage, PUSH_ASKED_AT_KEY } from "@/lib/storage-keys";

export type NotificationsAskSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

function markAsked() {
  appStorage.set(PUSH_ASKED_AT_KEY, String(Date.now()));
}

/**
 * Shown once, after the first request is received (25): the bell over the question, `Turn on notifications` (iOS then
 * asks once, itself) and `Not now` under it. Closing it any way is Not now.
 */
export const NotificationsAskSheet = forwardRef<NotificationsAskSheetHandle>(
  function NotificationsAskSheet(_props, ref) {
    const modalRef = useRef<ModalSheetHandle>(null);
    const insets = useSafeAreaInsets();

    useImperativeHandle(ref, () => ({
      present() {
        modalRef.current?.present();
      },
      dismiss() {
        modalRef.current?.dismiss();
      },
    }));

    return (
      <ModalSheet
        ref={modalRef}
        title="Know when your quote is ready."
        size="short"
        icon="bell"
        titleAlign="centre"
        showClose={false}
        // 25: as tall as the question and its two answers — the bell, two lines of headline, the pill and `Not now`.
        height={SHEET_HEIGHT + insets.bottom}
        footerBottom={tokens.space.sm}
        closeTestID="push-ask.close"
        testID="push-ask.root"
        insets={insets}
        stackBehavior="push"
        onDismiss={markAsked}
        footer={
          <View style={styles.actions}>
            <Button
              testID="push-ask.turn-on"
              label="Turn on notifications"
              variant="primary"
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
            <TextButton
              testID="push-ask.not-now"
              label="Not now"
              tone="secondary"
              size="button"
              onPress={() => modalRef.current?.dismiss()}
            />
          </View>
        }
      >
        {null}
      </ModalSheet>
    );
  },
);

/** The grabber 24, the bell 56, the question 70, then 16 to the pill (52), 8 and `Not now` (44), 12 under it. */
const SHEET_HEIGHT = 24 + 56 + 70 + 16 + 52 + 8 + 44 + 12;

const styles = StyleSheet.create({
  // 25: `Not now` 8 pt under the pill.
  actions: { gap: tokens.space.xs },
});
