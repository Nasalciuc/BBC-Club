import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, baselineOffset, belowBaseline, rn, tokens } from "@bbc/ui";

import { RootTabBar } from "@/components/RootTabBar";
import { ScreenStatusBar } from "@/components/screen-status-bar";
import { limitScope, limitedCopy } from "@/features/requests/confirmation-logic";
import { CAN_CALL, clubCall } from "@/lib/support-phone";

/**
 * 27, measured from the safe area's top (47 on the image): the title centred on 308.41 and 341.15, the words on 380.23
 * and 401.71, both in a 300-pt column — where 27 breaks them, a sentence to a line; the pill from 427.01, 42.75 tall,
 * 18.8 and 19.25 in — the filled handset 21.9 pt, 14.2 before the words, which sit 0.17 higher than the pill centres
 * them.
 */
const PAGE = {
  title: { baseline: 308.41, pitch: 32.74 },
  body: { baseline: 380.23, pitch: 21.48 },
  column: 300,
  pill: { top: 427.01, height: 42.75, left: 18.78, right: 19.25, icon: 21.9, gap: 14.21, words: { x: 0, y: -0.17 } },
} as const;
// 27's lines as it spaces them (the tokens round a line height to the point).
const title = {
  ...rn(tokens.type.limitedTitle),
  fontSize: tokens.type.limitedTitle.fontSize,
  lineHeight: PAGE.title.pitch,
};
const body = {
  ...rn(tokens.type.limitedBody),
  fontSize: tokens.type.limitedBody.fontSize,
  lineHeight: PAGE.body.pitch,
};

/**
 * Too many requests this hour (27): the message in the middle of the page — the member's own limit, or the neutral
 * words for an address shared with others (`limitedCopy`) — `Call your specialist` under it — only where the club's
 * general line is configured (support-phone.ts); `Done` otherwise. The tab bar shows Requests: the others are there.
 */
export default function RequestLimitedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ minutes?: string; scope?: string }>();
  const minutes = Number(params.minutes);
  const shown = Number.isFinite(minutes) && minutes > 0 ? minutes : 1;
  const call = clubCall("request.rateLimited.call", "Call your specialist");
  // The member's own limit blames the member; an address shared with others, or an unknown one, does not (F086).
  const copy = limitedCopy({ scope: limitScope({ scope: params.scope }), minutes: shown, canCall: CAN_CALL });
  const g = PAGE;
  return (
    <View style={styles.root} testID="request.rateLimited">
      <ScreenStatusBar on="light" />
      <View style={styles.body} testID="request.rateLimited.message">
        <Text
          style={[
            title,
            styles.navy,
            styles.column,
            { marginTop: insets.top + g.title.baseline - baselineOffset(title) },
          ]}
          accessibilityRole="header"
        >
          {copy.title}
        </Text>
        <Text
          style={[
            body,
            styles.slate,
            styles.column,
            {
              // From the title's last line, as 27 draws it on two.
              marginTop:
                g.body.baseline - g.title.baseline - g.title.pitch - belowBaseline(title) - baselineOffset(body),
            },
          ]}
        >
          {copy.body}
        </Text>
        <Button
          testID={call ? call.testID : "request.rateLimited.done"}
          label={call ? call.label : "Done"}
          variant="primary"
          icon={call ? "phone-fill" : undefined}
          iconSize={g.pill.icon}
          iconGap={g.pill.gap}
          height={g.pill.height}
          text="buttonLimited"
          labelOffset={g.pill.words}
          style={{
            marginLeft: g.pill.left,
            marginRight: g.pill.right,
            marginTop: g.pill.top - (g.body.baseline + g.body.pitch) - belowBaseline(body),
          }}
          onPress={call ? call.onPress : () => router.back()}
        />
      </View>
      <RootTabBar active="requests" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  body: { flex: 1 },
  navy: { color: tokens.colors.textPrimary },
  slate: { color: tokens.colors.textSecondary },
  column: { textAlign: "center", alignSelf: "center", maxWidth: PAGE.column },
});
