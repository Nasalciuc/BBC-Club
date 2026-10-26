import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "../icons";
import { Button } from "../primitives/Button";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  /** 1.0 prop, kept for the screens still moving to 3.0; the words decide the message. */
  variant?: "error" | "gone" | "offline";
  title: string;
  body?: string;
  primary?: { label: string; onPress: () => void; testID?: string; icon?: IconName };
  /** A quiet support link under the pill (`Call a specialist`). */
  secondary?: { label: string; onPress: () => void; testID?: string };
  reference?: string;
  /** `center` for a page with nothing else on it (21, 27); `start` under a header (26). */
  align?: "start" | "center";
  testID: string;
};

/**
 * One recoverable message on its own page (21, 26, 27): the title in `headline`, the words in slate, then the navy pill
 * and, when there is one, the support link. The parent gives the gutters. A message inside a page is a `NoticeCard`.
 */
export function StateMessage({ title, body, primary, secondary, reference, align = "start", testID }: Props) {
  const centered = align === "center";
  return (
    <View style={styles.wrap} testID={testID}>
      <View style={[styles.message, centered && styles.centered]}>
        <Text style={[styles.title, centered && styles.textCenter]} accessibilityRole="header">
          {title}
        </Text>
        {body ? <Text style={[styles.body, centered && styles.textCenter]}>{body}</Text> : null}
      </View>
      {primary || secondary ? (
        <View style={styles.actions}>
          {primary ? (
            <Button
              testID={primary.testID ?? `${testID}.primary`}
              label={primary.label}
              onPress={primary.onPress}
              icon={primary.icon}
              variant="primary"
            />
          ) : null}
          {secondary ? (
            <Pressable
              testID={secondary.testID ?? `${testID}.secondary`}
              accessibilityRole="button"
              accessibilityLabel={secondary.label}
              onPress={secondary.onPress}
              style={({ pressed }) => [styles.support, pressed && styles.pressed]}
            >
              <Text style={styles.supportLabel}>{secondary.label}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {reference ? <Text style={styles.ref}>{`REF ${reference}`}</Text> : null}
    </View>
  );
}

/** Kept so existing screens compile. Same component as StateMessage. */
export const ErrorState = StateMessage;

type NoticeProps = {
  /** `error`: light red with the red mark (sheet 41, error state); `offline`: light tint with the phone; `attention`. */
  tone: "error" | "offline" | "attention";
  title: string;
  body?: string;
  /** `Try again`, underlined. */
  link?: { label: string; onPress: () => void; testID: string };
  testID: string;
};

const NOTICE_ICON: Record<NoticeProps["tone"], IconName> = { error: "alert", offline: "phone", attention: "info" };

/** A message inside a page (sheet 41): error, offline, attention — a tinted card, its icon, the words, a link. */
export function NoticeCard({ tone, title, body, link, testID }: NoticeProps) {
  const error = tone === "error";
  return (
    <View
      testID={testID}
      style={[styles.notice, error ? styles.noticeError : styles.noticeTint]}
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.noticeIcon, tone === "offline" && styles.noticeIconCircle]}>
        <Icon
          name={NOTICE_ICON[tone]}
          size={tone === "offline" ? 22 : 30}
          color={error ? tokens.colors.statusDanger : tokens.colors.textPrimary}
          strokeWidth={2}
        />
      </View>
      <View style={styles.noticeText}>
        <Text style={styles.noticeTitle}>{title}</Text>
        {body ? <Text style={styles.noticeBody}>{body}</Text> : null}
        {link ? (
          <Pressable
            testID={link.testID}
            accessibilityRole="button"
            accessibilityLabel={link.label}
            // The link's line reaches 44 pt to the finger, whatever its role's height.
            hitSlop={{
              top: (44 - tokens.type.bodyStrong.lineHeight) / 2,
              bottom: (44 - tokens.type.bodyStrong.lineHeight) / 2,
              left: tokens.space.xs,
              right: tokens.space.xs,
            }}
            onPress={link.onPress}
            style={({ pressed }) => [styles.linkHit, pressed && styles.pressed]}
          >
            <Text style={styles.link}>{link.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "stretch", alignItems: "stretch", gap: tokens.space.lg },
  message: { gap: tokens.space.sm },
  centered: { alignItems: "center" },
  textCenter: { textAlign: "center" },
  title: { ...rn(tokens.type.headline), color: tokens.colors.textPrimary },
  body: { ...rn(tokens.type.bodyLg), color: tokens.colors.textSecondary },
  actions: { gap: tokens.space.xs },
  support: { minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: tokens.space.md },
  pressed: { opacity: 0.6 },
  supportLabel: { ...rn(tokens.type.body), color: tokens.colors.textSecondary, textAlign: "center" },
  ref: {
    ...rn(tokens.type.label),
    color: tokens.colors.textSecondary,
    textAlign: "center",
    marginTop: tokens.space.xs,
  },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: tokens.space.md,
    padding: tokens.space.lg,
    borderRadius: tokens.radius.md,
  },
  noticeError: {
    backgroundColor: tokens.colors.statusDangerTint,
    borderWidth: 1,
    borderColor: tokens.colors.statusDangerTint,
  },
  noticeTint: { backgroundColor: tokens.colors.surfaceTint },
  noticeIcon: { width: 44, alignItems: "center", paddingTop: 2 },
  noticeIconCircle: {
    height: 44,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.borderDefault,
    justifyContent: "center",
    paddingTop: 0,
  },
  noticeText: { flex: 1, gap: tokens.space.xxs },
  noticeTitle: { ...rn(tokens.type.subtitle), color: tokens.colors.textPrimary },
  // Words on a tinted card: `text-on-tint`, where slate falls under 4.5:1 (DESIGN.md, Colors).
  noticeBody: { ...rn(tokens.type.body), color: tokens.colors.textOnTint },
  linkHit: { alignSelf: "flex-start", marginTop: tokens.space.xxs },
  link: { ...rn(tokens.type.bodyStrong), color: tokens.colors.textPrimary, textDecorationLine: "underline" },
});
