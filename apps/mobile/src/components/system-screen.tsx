import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, StateMessage, tokens, rn } from "@bbc/ui";

import type { ClubCall } from "@/lib/support-phone-logic";

type Props = {
  testID: string;
  /** The message's own id: `<testID>.message` unless given. */
  messageTestID?: string;
  title: string;
  body: string;
  primary: { label: string; testID: string; onPress: () => void };
  /** `Call an agent`: the club's general line with its words (`clubCall`, support-phone.ts), null without one
   *  (240:5129, 240:5163). */
  call?: ClubCall | null;
};

/**
 * Figma's page-wide messages (240:5093 generic error, 240:5129 update required, 240:5163 maintenance): the wordmark at
 * the safe area, the message 48 pt under it, and `Call an agent` — a secondary button — 12 pt under the message's
 * action.
 */
export function SystemScreen({ testID, messageTestID, title, body, primary, call }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View testID={testID} style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + tokens.space.lg }]}>
        <Text style={styles.wordmark}>BUYBUSINESSCLASS</Text>
        <View style={styles.message}>
          <StateMessage
            testID={messageTestID ?? `${testID}.message`}
            variant="error"
            title={title}
            body={body}
            primary={primary}
          />
          {call ? <Button testID={call.testID} label={call.label} variant="secondary" onPress={call.onPress} /> : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  // Figma 240:5095: the wordmark and the message 24 pt apart in the gutters.
  content: { paddingHorizontal: tokens.space.lg, gap: tokens.space.lg },
  wordmark: { ...rn(tokens.type.label), color: tokens.colors.textPrimary },
  // Figma 240:5153: 48 pt above the message; `Call an agent` 12 pt under it.
  message: { paddingTop: tokens.space.xxl, gap: tokens.space.sm },
});
