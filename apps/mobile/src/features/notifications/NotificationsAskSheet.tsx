import { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, ModalSheet, type ModalSheetHandle, tokens, rn } from "@bbc/ui";

import { registerPushDevice } from "@/lib/push";
import { appStorage, PUSH_ASKED_AT_KEY } from "@/lib/storage-keys";

export type NotificationsAskSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

function markAsked() {
  appStorage.set(PUSH_ASKED_AT_KEY, String(Date.now()));
}

/** Shown once, after the first request is received. Close is Not now. */
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
      // Figma 320:5704: a question — the medium sheet under a 28-pt headline. Closing it is Not now (onDismiss).
      <ModalSheet
        ref={modalRef}
        title="Know when your quote is ready."
        size="medium"
        closeTestID="push-ask.not-now"
        testID="push-ask.root"
        contentGap={tokens.space.md}
        insets={insets}
        stackBehavior="push"
        onDismiss={markAsked}
        footer={
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
        }
      >
        <Text style={styles.body}>
          We'll notify you once when your specialist has a quote. Nothing else unless you choose it.
        </Text>
      </ModalSheet>
    );
  },
);

const styles = StyleSheet.create({
  body: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
});
