import { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, MODAL_SHEET_LOOKS, ModalSheet, type ModalSheetHandle, QUESTION_ANSWERS, TextButton } from "@bbc/ui";

import { registerPushDevice } from "@/lib/push";
import { appStorage, PUSH_ASKED_AT_KEY } from "@/lib/storage-keys";

export type NotificationsAskSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

function markAsked() {
  appStorage.set(PUSH_ASKED_AT_KEY, String(Date.now()));
}

/** 25 is drawn over a 34-pt home indicator: a taller inset makes the sheet taller by the difference. */
const IMAGE_INSET = 34;

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
        look="question"
        showClose={false}
        height={MODAL_SHEET_LOOKS.question.height + Math.max(0, insets.bottom - IMAGE_INSET)}
        scroll={false}
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
              height={QUESTION_ANSWERS.pill}
              text="buttonQuestion"
              labelOffset={QUESTION_ANSWERS.words}
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
              text="buttonNotNow"
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

const styles = StyleSheet.create({
  // 25: `Not now`'s line 12.95 under the pill.
  actions: { gap: QUESTION_ANSWERS.gap, alignItems: "stretch" },
});
