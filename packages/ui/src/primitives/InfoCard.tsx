import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  title: string;
  body?: string;
  icon: IconName;
  /** `circle`: the icon in a light navy circle (11's phone); `bare`: the icon alone (01's family, 28's info). */
  iconStyle?: "circle" | "bare";
  /** A link under the body (`Try again`). */
  link?: { label: string; onPress: () => void; testID: string };
  /** The whole card acts, with a chevron (sheet 40, 01 and 11). */
  onPress?: () => void;
  testID?: string;
};

/**
 * The info card in light tint (01, 11, 28, 30–33; sheets 40 and 41): the icon, a title in `body-strong`, the body in
 * slate; optionally a `Try again` link, or the whole card a tap with a chevron.
 */
export function InfoCard({ title, body, icon, iconStyle = "circle", link, onPress, testID }: Props) {
  const content = (
    <>
      {iconStyle === "circle" ? (
        <View style={styles.circle}>
          <Icon name={icon} size={22} color={tokens.colors.textPrimary} strokeWidth={2} />
        </View>
      ) : (
        <View style={styles.bare}>
          <Icon name={icon} size={30} color={tokens.colors.textPrimary} strokeWidth={1.75} />
        </View>
      )}
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        {body ? <Text style={styles.body}>{body}</Text> : null}
        {link ? (
          <Pressable
            testID={link.testID}
            accessibilityRole="button"
            accessibilityLabel={link.label}
            // The 22-pt line reaches 44 pt to the finger.
            hitSlop={{ top: tokens.space.sm, bottom: tokens.space.sm, left: tokens.space.xs, right: tokens.space.xs }}
            onPress={link.onPress}
            style={({ pressed }) => [styles.linkHit, pressed && styles.pressed]}
          >
            <Text style={styles.link}>{link.label}</Text>
          </Pressable>
        ) : null}
      </View>
      {onPress ? <Icon name="chevron" size={20} color={tokens.colors.textSecondary} strokeWidth={2} /> : null}
    </>
  );
  if (onPress) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={[title, body].filter(Boolean).join(". ")}
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    );
  }
  return (
    <View
      testID={testID}
      style={styles.card}
      accessible={!link}
      accessibilityLabel={link ? undefined : [title, body].filter(Boolean).join(". ")}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
    padding: tokens.space.md,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.surfaceTint,
  },
  circle: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.borderDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  bare: { width: 36, alignItems: "center" },
  text: { flex: 1, gap: 2 },
  title: { ...rn(tokens.type.bodyStrong), color: tokens.colors.textPrimary },
  // Words on the light tint: `text-on-tint`, where slate falls under 4.5:1 (DESIGN.md, Colors).
  body: { ...rn(tokens.type.bodySm), color: tokens.colors.textOnTint },
  linkHit: { alignSelf: "flex-start", marginTop: tokens.space.xxs },
  link: { ...rn(tokens.type.bodyStrong), color: tokens.colors.textPrimary, textDecorationLine: "underline" },
  pressed: { opacity: 0.7 },
});
