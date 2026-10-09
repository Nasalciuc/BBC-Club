import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, tokens, rn } from "@bbc/ui";

/** Figma Header (89:386–89:391): the wordmark at the left, one of three things at the right. */
export type HeaderAction =
  | { kind: "profile"; initials: string; onPress: () => void }
  | { kind: "cancel"; onPress: () => void }
  | { kind: "done"; onPress: () => void };

type Props = {
  /** `dark` over the globe (89:386, 89:387); `light` on the page once the sheet fills it (89:388–89:391). */
  tone: "dark" | "light";
  action: HeaderAction;
  topInset: number;
};

export const WORDMARK = "BUYBUSINESSCLASS";

/**
 * x 24, y 56, 345 × 48 on the 393 × 852 frames: the wordmark in `labelMono`, and at the right the 48 pt profile pill
 * (`AM`, → Profile), or `Cancel` while typing, or `Done` while the offers are expanded. Nothing else ever sits here.
 */
export function ExploreHeader({ tone, action, topInset }: Props) {
  const dark = tone === "dark";
  return (
    <View style={[styles.row, { marginTop: topInset + tokens.space.xs }]} testID="explore.header">
      <Text style={[styles.wordmark, dark ? styles.onDark : styles.onLight]} accessibilityRole="header">
        {WORDMARK}
      </Text>
      {action.kind === "profile" ? (
        <Pressable
          testID="explore.profile"
          accessibilityRole="button"
          accessibilityLabel="Profile"
          onPress={action.onPress}
          style={({ pressed }) => [styles.pill, dark ? styles.pillDark : styles.pillLight, pressed && styles.pressed]}
        >
          {action.initials ? (
            <Text style={[styles.initials, dark ? styles.onDark : styles.onLight]}>{action.initials}</Text>
          ) : (
            <Icon name="profile" size={24} color={dark ? tokens.colors.textOnDark : tokens.colors.textPrimary} />
          )}
        </Pressable>
      ) : action.kind === "cancel" ? (
        <TextButton testID="explore.cancel" label="Cancel" dark={dark} onPress={action.onPress} />
      ) : (
        <TextButton testID="explore.done" label="Done" dark={dark} onPress={action.onPress} />
      )}
    </View>
  );
}

function TextButton({
  testID,
  label,
  dark,
  onPress,
}: {
  testID: string;
  label: string;
  dark: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
    >
      <Text style={[styles.textButtonLabel, dark ? styles.onDark : styles.onLight]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    height: 48,
    marginHorizontal: tokens.space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  wordmark: { ...rn(tokens.type.labelMono) },
  onDark: { color: tokens.colors.textOnDark },
  onLight: { color: tokens.colors.textPrimary },
  pill: { width: 48, height: 48, borderRadius: tokens.radius.pill, alignItems: "center", justifyContent: "center" },
  pillDark: { backgroundColor: tokens.colors.surfaceMuted },
  pillLight: { backgroundColor: tokens.colors.borderDefault },
  initials: { ...rn(tokens.type.button) },
  textButton: { minWidth: 80, height: 48, alignItems: "flex-end", justifyContent: "center" },
  textButtonLabel: { ...rn(tokens.type.button) },
  pressed: { opacity: 0.7 },
});
