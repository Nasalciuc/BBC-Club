import { Pressable, StyleSheet, Text, View } from "react-native";
import { FAMILY } from "../art-paths";
import { ArtGlyph, Icon, type IconName } from "../icons";
import { baselineOffset, belowBaseline, rn } from "../rn-type";
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
  /**
   * `attention`: 28's card over the list, as measured — the bare info mark (27 pt, its stroke 2), a Bold title and
   * one line under it, on the notice tint, radius 9. `detail`: 11's, the mark in its circle. `family`: 01's
   * `Travelling with children?`, the traced adult and child at their own size. Without it, the 1.0 card.
   */
  look?: "attention" | "detail" | "family";
  testID?: string;
};

/**
 * The info card in light tint (01, 11, 28, 30–33; sheets 40 and 41): the icon, a title in `body-strong`, the body in
 * slate; optionally a `Try again` link, or the whole card a tap with a chevron.
 */
export function InfoCard({ title, body, icon, iconStyle = "circle", link, onPress, look, testID }: Props) {
  if (look === "detail") {
    // 11, 30–33: what is happening with the request. A title alone (33) is centred in its card.
    const alone = !body;
    return (
      <View
        testID={testID}
        style={[styles.detail, alone && styles.detailAlone]}
        accessible
        accessibilityLabel={[title, body].filter(Boolean).join(". ")}
      >
        <View style={[styles.detailCircle, alone && styles.detailCircleAlone]}>
          <Icon name={icon} size={DETAIL.icon} color={tokens.colors.textPrimary} />
        </View>
        <View style={styles.detailText}>
          <Text style={[styles.detailTitle, alone && styles.detailTitleAlone]}>{title}</Text>
          {body ? <Text style={styles.detailBody}>{body}</Text> : null}
        </View>
      </View>
    );
  }
  if (look === "family") {
    return (
      <View
        testID={testID}
        style={styles.family}
        accessible
        accessibilityLabel={[title, body].filter(Boolean).join(". ")}
      >
        <View style={styles.familyIcon}>
          <ArtGlyph art={FAMILY} height={FAMILY_CARD.icon} color={tokens.colors.textSecondary} />
        </View>
        <View style={styles.familyText}>
          <Text style={styles.familyTitle}>{title}</Text>
          {body ? <Text style={styles.familyBody}>{body}</Text> : null}
        </View>
      </View>
    );
  }
  if (look === "attention") {
    return (
      <View
        testID={testID}
        style={styles.attention}
        accessible
        accessibilityLabel={[title, body].filter(Boolean).join(". ")}
      >
        <View style={styles.attentionIcon}>
          <Icon name={icon} size={ATTENTION.icon} color={tokens.colors.textPrimary} strokeWidth={ATTENTION.stroke} />
        </View>
        <View style={styles.attentionText}>
          <Text style={styles.attentionTitle}>{title}</Text>
          {body ? <Text style={styles.attentionBody}>{body}</Text> : null}
        </View>
      </View>
    );
  }
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

/**
 * 28, measured (card top T, left L): the mark's 27-pt box 14.65 in and 13.45 down; the words 56.25 in; the title's
 * baseline T+25.6, the line's 18 under it, the card's foot 15.4 under that; the line ends 27.8 pt from the right.
 */
const ATTENTION = { radius: 9, icon: 27, stroke: 1.96, iconLeft: 14.65, iconTop: 13.45, textLeft: 56.25 } as const;
const noticeTitle = tokens.type.noticeTitleSm;
const noticeBody = tokens.type.noticeBodySm;

/**
 * 11, measured (card top T, left L): radius 9.5 on the notice tint; a 35.5-pt circle 16.6 in, its centre T+33.5, the
 * filled mark 17.5 pt in it; the words 66.1 in, 60 pt short of the right edge (where 11 wraps `…to confirm`); the
 * title's baseline T+25.1, the words' first 18.9 pt under the title's last, 15.7 apart; the foot 15 pt under the last.
 * A title alone (33): the card 62.4 tall with the circle and the title centred.
 */
const DETAIL = { radius: 9.5, circle: 35.5, circleLeft: 16.6, circleCentre: 33.5, icon: 17.5, textLeft: 66.1 } as const;
const detailTitle = tokens.type.noticeTitle;
const detailBody = tokens.type.noticeBody;

/**
 * 01, measured (card top T, left L): 59.5 tall, radius 10.75, on the soft tint; the adult and child at their own size
 * (23 pt tall) 18.7 in and 17.6 down; the words 56.3 in, the title's baseline T+26, the line's 17.4 under it.
 */
const FAMILY_CARD = {
  height: 59.5,
  radius: 10.75,
  icon: 23.04,
  iconLeft: 18.67,
  iconTop: 17.58,
  textLeft: 56.3,
  title: 26,
  pitch: 17.4,
} as const;
const familyTitle = tokens.type.familyTitle;
const familyBody = tokens.type.familyBody;

const styles = StyleSheet.create({
  family: {
    minHeight: FAMILY_CARD.height,
    borderRadius: FAMILY_CARD.radius,
    backgroundColor: tokens.colors.surfaceTintSoft,
  },
  familyIcon: { position: "absolute", left: FAMILY_CARD.iconLeft, top: FAMILY_CARD.iconTop },
  familyText: {
    marginLeft: FAMILY_CARD.textLeft,
    marginRight: tokens.space.md,
    // the card is 01's height (its minimum, a little more than the words need); more words grow it
    paddingBottom: FAMILY_CARD.height - FAMILY_CARD.title - FAMILY_CARD.pitch - belowBaseline(familyBody) - 4,
  },
  familyTitle: {
    ...rn(familyTitle),
    color: tokens.colors.textPrimary,
    marginTop: FAMILY_CARD.title - baselineOffset(familyTitle),
  },
  familyBody: {
    ...rn(familyBody),
    color: tokens.colors.textSecondary,
    marginTop: FAMILY_CARD.pitch - belowBaseline(familyTitle) - baselineOffset(familyBody),
  },
  detail: {
    flexDirection: "row",
    borderRadius: DETAIL.radius,
    backgroundColor: tokens.colors.surfaceNotice,
    paddingBottom: 15 - belowBaseline(detailBody),
    // 11 and 30 draw the card 74 tall with one line of words or two, 32 at 70: the one height that suits all three.
    minHeight: 72,
  },
  detailAlone: { minHeight: 62.4, paddingBottom: 0, alignItems: "center" },
  detailCircle: {
    position: "absolute",
    left: DETAIL.circleLeft,
    top: DETAIL.circleCentre - DETAIL.circle / 2,
    width: DETAIL.circle,
    height: DETAIL.circle,
    borderRadius: DETAIL.circle / 2,
    backgroundColor: tokens.colors.noticeCircle,
    alignItems: "center",
    justifyContent: "center",
  },
  detailCircleAlone: { top: (62.4 - DETAIL.circle) / 2 },
  detailText: { flex: 1, marginLeft: DETAIL.textLeft, paddingRight: 60 },
  detailTitle: {
    ...rn(detailTitle),
    color: tokens.colors.textPrimary,
    marginTop: 25.1 - baselineOffset(detailTitle),
  },
  detailTitleAlone: { marginTop: 0 },
  detailBody: {
    ...rn(detailBody),
    color: tokens.colors.textOnTint,
    marginTop: 18.9 - belowBaseline(detailTitle) - baselineOffset(detailBody),
  },
  attention: {
    flexDirection: "row",
    borderRadius: ATTENTION.radius,
    backgroundColor: tokens.colors.surfaceNotice,
    paddingBottom: 15.4 - belowBaseline(noticeBody),
  },
  attentionIcon: { position: "absolute", left: ATTENTION.iconLeft, top: ATTENTION.iconTop },
  attentionText: { flex: 1, marginLeft: ATTENTION.textLeft, paddingRight: 12 },
  attentionTitle: {
    ...rn(noticeTitle),
    color: tokens.colors.textPrimary,
    marginTop: 25.6 - baselineOffset(noticeTitle),
  },
  attentionBody: {
    ...rn(noticeBody),
    color: tokens.colors.textOnTint,
    marginTop: 18 - belowBaseline(noticeTitle) - baselineOffset(noticeBody),
  },
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
