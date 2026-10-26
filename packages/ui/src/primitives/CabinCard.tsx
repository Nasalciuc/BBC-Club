import { Pressable, StyleSheet, Text, View } from "react-native";

import { CABIN_BUSINESS, CABIN_FIRST } from "../art-paths";
import { ArtGlyph, Icon } from "../icons";
import { baselineOffset, belowBaseline, rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  title: string;
  /** Its line in slate, broken where 01 breaks it (`More space,\na better journey`). */
  line: string;
  /** Business's reclining seat or First's armchair — never one for the other. */
  cabin: "business" | "first";
  selected: boolean;
  onPress: () => void;
  testID: string;
};

/**
 * 01, measured (card top T, left L): the card 72.8 tall, radius 10.5; the seat at its own size (33.2 tall) 18.9 in and
 * 20 down; the words 64.7 in, the cabin's baseline T+28.35, its line's T+43.6 and 12 under it; the check 22.6 across
 * (the empty circle 23.5 on a 1.2 ring) 13 from the right, its centre T+35.7.
 */
const CARD = { height: 72.8, radius: 10.5, iconLeft: 18.9, iconTop: 20, icon: 33.2, textLeft: 64.7 } as const;
const MARK = { check: 22.6, ring: 23.5, ringWidth: 1.2, right: 13, centre: 35.7, glyph: 13.5 } as const;
const TITLE_BASELINE = 28.35;
const LINE_BASELINE = 43.6;

/**
 * A cabin to choose (01; sheet 39): the seat, the cabin over its line, a check circle. Chosen: a navy border on the
 * selected tint and a filled navy check; the other white on its hairline, its circle empty. Two side by side.
 */
export function CabinCard({ title, line, cabin, selected, onPress, testID }: Props) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={`${title}, ${line.replace(/\n/g, " ")}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, selected && styles.selected, pressed && styles.pressed]}
    >
      <View style={styles.icon}>
        <ArtGlyph
          art={cabin === "business" ? CABIN_BUSINESS : CABIN_FIRST}
          height={CARD.icon}
          color={selected ? tokens.colors.textPrimary : tokens.colors.textSecondary}
        />
      </View>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.line}>{line}</Text>
      </View>
      {selected ? (
        <View style={[styles.mark, styles.check]}>
          <Icon name="check" size={MARK.glyph} color={tokens.colors.textOnPhoto} strokeWidth={2.85} />
        </View>
      ) : (
        <View style={[styles.mark, styles.ring]} />
      )}
    </Pressable>
  );
}

const titleType = tokens.type.cabinTitle;
const lineType = tokens.type.cabinLine;

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: CARD.height,
    borderRadius: CARD.radius,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    backgroundColor: tokens.colors.surfaceCard,
    ...tokens.elevation.soft,
  },
  selected: {
    borderColor: tokens.colors.textPrimary,
    borderWidth: 1.1,
    backgroundColor: tokens.colors.surfaceSelected,
  },
  pressed: { opacity: 0.85 },
  // The border is inside the card's box: the measured insets are from the card's outer edge.
  icon: { position: "absolute", left: CARD.iconLeft - 1, top: CARD.iconTop - 1 },
  text: {
    marginLeft: CARD.textLeft - 1,
    marginRight: MARK.right + MARK.ring + 4,
    // the foot under the line's last baseline: the card is 01's height with two lines (its minimum, a little more than
    // the words need), more words grow it
    paddingBottom: CARD.height - (LINE_BASELINE + lineType.lineHeight) - belowBaseline(lineType) - 4,
  },
  title: {
    ...rn(titleType),
    color: tokens.colors.textPrimary,
    marginTop: TITLE_BASELINE - 1 - baselineOffset(titleType),
  },
  line: {
    ...rn(lineType),
    color: tokens.colors.textSecondary,
    marginTop:
      LINE_BASELINE - TITLE_BASELINE - (titleType.lineHeight - baselineOffset(titleType)) - baselineOffset(lineType),
  },
  mark: { position: "absolute", right: MARK.right - 1, alignItems: "center", justifyContent: "center" },
  check: {
    top: MARK.centre - 1 - MARK.check / 2,
    width: MARK.check,
    height: MARK.check,
    borderRadius: MARK.check / 2,
    backgroundColor: tokens.colors.textPrimary,
  },
  ring: {
    top: MARK.centre - 1 - MARK.ring / 2,
    width: MARK.ring,
    height: MARK.ring,
    borderRadius: MARK.ring / 2,
    borderWidth: MARK.ringWidth,
    borderColor: tokens.colors.chevronLight,
    backgroundColor: tokens.colors.surfaceCard,
  },
});
