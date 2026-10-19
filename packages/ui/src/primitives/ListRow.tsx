import { Children, createContext, Fragment, isValidElement, type ReactNode, useContext } from "react";
import { Pressable, StyleSheet, Text, View, type TextStyle } from "react-native";
import { Icon, type IconName } from "../icons";
import { baselineOffset, belowBaseline, rn } from "../rn-type";
import { tokens } from "../tokens";
import { Toggle } from "./Toggle";

/**
 * The row cards as each screen draws them, measured from the card's left and right edges (pt): `profile` (12), the
 * compact rows under My trips; `settings` (34); `edit` (36). Each its row height, its mark's box and centre, where the
 * words start, where the value ends, its chevron (box, stroke, ink 'right' inset) and its rules.
 */
type RowLook = {
  radius: number;
  height: number;
  icon: number;
  iconCentre: number;
  labelLeft: number;
  valueRight: number;
  chevron: { size: number; stroke: number; right: number; color: string };
  /** The rule between rows: from where it starts, how short of the right edge it stops, its colour (05's darker). */
  rule: { left: number; right: number; color?: string };
  label: TextStyle & { fontSize: number; lineHeight: number };
  value: TextStyle;
  sub: TextStyle & { fontSize: number; lineHeight: number };
  danger: TextStyle;
  labelColor: string;
  valueColor: string;
  /** `edge`: the card on a hairline with the soft shadow (05), not the card shadow alone. */
  card?: "edge";
};

export type RowLookName = "profile" | "settings" | "edit" | "fare";

const LOOKS: Record<RowLookName, RowLook> = {
  profile: {
    radius: 10,
    height: 29.65,
    icon: 16.5,
    iconCentre: 22.5,
    labelLeft: 45.3,
    valueRight: 25.9,
    chevron: { size: 13.4, stroke: 1.6, right: 11.2, color: tokens.colors.chevronLight },
    rule: { left: 45.4, right: 11 },
    label: rn(tokens.type.profileRow) as RowLook["label"],
    value: rn(tokens.type.profileValue),
    sub: rn(tokens.type.profileValue) as RowLook["sub"],
    danger: rn(tokens.type.profileDanger),
    labelColor: tokens.colors.textOnTint,
    valueColor: tokens.colors.textOnTint,
  },
  settings: {
    radius: 9,
    height: 47.1,
    icon: 19.4,
    iconCentre: 25.2,
    labelLeft: 52.4,
    valueRight: 30.4,
    chevron: { size: 17, stroke: 1.98, right: 12.9, color: tokens.colors.chevronLight },
    rule: { left: 19.3, right: 7.8 },
    label: rn(tokens.type.settingsRow) as RowLook["label"],
    value: rn(tokens.type.settingsValue),
    sub: rn(tokens.type.settingsSub) as RowLook["sub"],
    danger: rn(tokens.type.settingsDanger),
    labelColor: tokens.colors.textPrimary,
    valueColor: tokens.colors.textPrimary,
  },
  // 05: `About this fare` and `The comparison`, 37 pt each; the marks 20 pt on 22, the words from 51.05; the rule
  // from 43.1 to 13.1 short of the right edge; the chevron 20 at 1.8, its ink 15 from the edge.
  fare: {
    radius: 9,
    height: 37,
    icon: 20,
    iconCentre: 22,
    labelLeft: 51.05,
    valueRight: 30,
    chevron: { size: 20, stroke: 1.8, right: 15, color: tokens.colors.textMuted },
    rule: { left: 43.1, right: 13.1, color: tokens.colors.ruleLine },
    label: rn(tokens.type.fareRow) as RowLook["label"],
    value: rn(tokens.type.fareRow),
    sub: rn(tokens.type.fareRow) as RowLook["sub"],
    danger: rn(tokens.type.fareRow),
    labelColor: tokens.colors.textPrimary,
    valueColor: tokens.colors.textSecondary,
    card: "edge",
  },
  edit: {
    radius: 11,
    height: 48.2,
    icon: 21,
    iconCentre: 25.4,
    labelLeft: 52.2,
    valueRight: 31.3,
    chevron: { size: 17.4, stroke: 1.66, right: 12, color: tokens.colors.chevronLight },
    rule: { left: 51.9, right: 12.9 },
    label: rn(tokens.type.editRow) as RowLook["label"],
    value: rn(tokens.type.editValue),
    sub: rn(tokens.type.editValue) as RowLook["sub"],
    danger: rn(tokens.type.editRow),
    labelColor: tokens.colors.textOnTint,
    valueColor: tokens.colors.textOnTint,
  },
};

/** Inside a `RowGroup`: the group draws the card and the rules between rows, in its look (null: the 1.0 rows). */
const InGroup = createContext<{ look: RowLookName | null; height: number | null } | null>(null);

type Props = {
  label: string;
  onPress?: () => void;
  /** The current value at the right, in slate (`+1 212 555 0142`, `Change`). */
  value?: string;
  /** Under the label, in slate (`Request updates are always on.`). */
  subtitle?: string;
  /** `stacked`: the label small over the value (sheet 40, the row card with icons: `Home airport` / `New York (JFK)`). */
  stacked?: boolean;
  icon?: IconName;
  /** `chevron` by default when the row acts; `external` opens a page outside the app. */
  trailing?: "chevron" | "none" | "external";
  /** 1.0 prop, kept while its screens move to 3.0. */
  chevron?: boolean;
  /** `Delete account`: the icon and the words in red. */
  danger?: boolean;
  disabled?: boolean;
  toggle?: { value: boolean; onChange?: (next: boolean) => void; testID: string; locked?: boolean };
  /** 1.0 prop, kept while its screens move to 3.0. */
  size?: "md" | "sm";
  /** A row alone in its card (`Delete account`): the look and height of its screen's rows. */
  look?: RowLookName;
  height?: number;
  testID?: string;
};

/**
 * A row of the row cards (12, 34, 36; sheet 40): the navy icon in a 24-pt column, the label, the value in slate at the
 * right, the chevron. In a `RowGroup` the group is the card; alone, the row is its own white card.
 */
export function ListRow({
  label,
  onPress,
  value,
  subtitle,
  stacked = false,
  icon,
  trailing,
  chevron = true,
  danger = false,
  disabled = false,
  toggle,
  look: ownLook,
  height: ownHeight,
  testID,
}: Props) {
  const group = useContext(InGroup);
  const inGroup = group !== null;
  const lookName = group?.look ?? ownLook ?? null;
  if (lookName) {
    return (
      <LookRow
        look={LOOKS[lookName]}
        height={group?.height ?? ownHeight ?? null}
        alone={!inGroup}
        label={label}
        value={value}
        subtitle={subtitle}
        icon={icon}
        danger={danger}
        disabled={disabled}
        onPress={onPress}
        toggle={toggle}
        testID={testID}
      />
    );
  }
  const pressable = onPress != null && !disabled;
  const showChevron = toggle == null && (trailing != null ? trailing === "chevron" : onPress != null && chevron);
  const role = trailing === "external" ? "link" : "button";
  const tint = danger ? tokens.colors.statusDanger : tokens.colors.textPrimary;
  const a11yLabel = [label, value, subtitle].filter(Boolean).join(", ");

  const body = (
    <>
      {icon ? (
        <View style={styles.iconCol}>
          <Icon name={icon} size={24} color={tint} strokeWidth={1.75} />
        </View>
      ) : null}
      {stacked ? (
        <View style={styles.text}>
          <Text style={styles.small} numberOfLines={1}>
            {label}
          </Text>
          {value ? (
            <Text style={styles.label} numberOfLines={1}>
              {value}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.text}>
          <Text style={[styles.label, danger && styles.danger]} numberOfLines={1}>
            {label}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      )}
      {!stacked && value ? (
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {showChevron ? <Icon name="chevron" size={20} color={tokens.colors.textSecondary} strokeWidth={2} /> : null}
      {trailing === "external" ? (
        <Icon name="chevron" size={20} color={tokens.colors.textSecondary} strokeWidth={2} />
      ) : null}
      {toggle ? (
        <Toggle
          value={toggle.value}
          onChange={toggle.onChange}
          testID={toggle.testID}
          locked={toggle.locked}
          disabled={disabled}
          accessibilityLabel={label}
        />
      ) : null}
    </>
  );

  const frame = [styles.row, !inGroup && styles.card, stacked && styles.stackedRow];
  if (!pressable) {
    const dimmedAction = onPress != null && toggle == null;
    return (
      <View
        testID={testID}
        style={[...frame, disabled && styles.disabled]}
        accessible={dimmedAction}
        accessibilityRole={dimmedAction ? role : undefined}
        accessibilityState={dimmedAction ? { disabled: true } : undefined}
        accessibilityLabel={a11yLabel}
      >
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole={role}
      accessibilityLabel={a11yLabel}
      onPress={onPress}
      style={({ pressed }) => [...frame, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

/**
 * A row in a screen's look (12, 34, 36), as measured: the mark centred in its column, the label from where the words
 * start, the value ending where the screen ends it, the thin chevron at its inset; everything centred on the row. With
 * a subtitle (34's Notifications), the label's baseline 25.9 pt under the row's top, the subtitle 16.6 under it, the
 * row's foot 16.6 under that.
 */
function LookRow({
  look,
  height,
  alone,
  label,
  value,
  subtitle,
  icon,
  danger,
  disabled,
  onPress,
  toggle,
  testID,
}: {
  look: RowLook;
  height: number | null;
  alone: boolean;
  label: string;
  value?: string;
  subtitle?: string;
  icon?: IconName;
  danger: boolean;
  disabled: boolean;
  onPress?: () => void;
  toggle?: Props["toggle"];
  testID?: string;
}) {
  const pressable = onPress != null && !disabled;
  const tint = danger ? tokens.colors.statusDanger : tokens.colors.textPrimary;
  const a11yLabel = [label, value, subtitle].filter(Boolean).join(", ");
  const rowHeight = height ?? look.height;
  const chevronBoxRight = look.chevron.right - ((9 - look.chevron.stroke / 2) * look.chevron.size) / 24;
  const body = (
    <>
      {icon ? (
        <View style={[lookStyles.icon, { left: look.iconCentre - look.icon / 2, width: look.icon }]}>
          <Icon name={icon} size={look.icon} color={tint} strokeWidth={1.75} />
        </View>
      ) : null}
      <View style={[lookStyles.text, { marginLeft: look.labelLeft }]}>
        <Text
          style={[
            danger ? look.danger : look.label,
            { color: danger ? tokens.colors.statusDangerText : look.labelColor },
            subtitle ? { marginTop: 25.9 - baselineOffset(look.label) } : null,
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {subtitle ? (
          <Text
            style={[
              look.sub,
              {
                color: tokens.colors.textSecondary,
                marginTop: 16.6 - belowBaseline(look.label) - baselineOffset(look.sub),
                marginBottom: 16.6 - belowBaseline(look.sub),
              },
            ]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={[look.value, lookStyles.value, { color: look.valueColor }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {toggle ? (
        <Toggle
          value={toggle.value}
          onChange={toggle.onChange}
          testID={toggle.testID}
          locked={toggle.locked}
          disabled={disabled}
          accessibilityLabel={label}
        />
      ) : onPress ? (
        <View style={[lookStyles.chevron, { right: chevronBoxRight }]} pointerEvents="none">
          <Icon name="chevron" size={look.chevron.size} color={look.chevron.color} strokeWidth={look.chevron.stroke} />
        </View>
      ) : null}
    </>
  );
  const frame = [
    lookStyles.row,
    { minHeight: rowHeight, paddingRight: look.valueRight },
    alone && [lookStyles.card, { borderRadius: look.radius }],
  ];
  if (!pressable) {
    return (
      <View
        testID={testID}
        style={[...frame, disabled && styles.disabled]}
        accessible={onPress != null}
        accessibilityRole={onPress != null ? "button" : undefined}
        accessibilityState={onPress != null ? { disabled: true } : undefined}
        accessibilityLabel={a11yLabel}
      >
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      onPress={onPress}
      style={({ pressed }) => [...frame, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

/**
 * A white card of rows (12, 34, 36). In a screen's `look`: its radius and shadow, its rows' height (`rowHeight` where
 * a card's rows differ from the screen's others), its rules from where the screen starts them. Without one, the 1.0
 * card: radius 11, a rule from where the words start.
 */
export function RowGroup({
  children,
  testID,
  look,
  rowHeight,
}: {
  children: ReactNode;
  testID?: string;
  look?: RowLookName;
  rowHeight?: number;
}) {
  const rows = Children.toArray(children).filter(isValidElement);
  const l = look ? LOOKS[look] : null;
  return (
    <InGroup.Provider value={{ look: look ?? null, height: rowHeight ?? null }}>
      <View
        style={
          l ? [l.card === "edge" ? lookStyles.edgeCard : lookStyles.card, { borderRadius: l.radius }] : styles.group
        }
        testID={testID}
      >
        {rows.map((row, i) =>
          l ? (
            // The rule lies over the row's top edge: the rows keep the screen's pitch exactly.
            <View key={row.key ?? i}>
              {row}
              {i > 0 ? (
                <View
                  style={[
                    lookStyles.rule,
                    { left: l.rule.left, right: l.rule.right },
                    l.rule.color ? { backgroundColor: l.rule.color } : null,
                  ]}
                  pointerEvents="none"
                />
              ) : null}
            </View>
          ) : (
            <Fragment key={row.key ?? i}>
              {i > 0 ? <View style={styles.rule} /> : null}
              {row}
            </Fragment>
          ),
        )}
        {l?.card === "edge" ? (
          // The hairline over the card's edge: it does not move the rows measured from the card's corner.
          <View pointerEvents="none" style={[lookStyles.edge, { borderRadius: l.radius }]} />
        ) : null}
      </View>
    </InGroup.Provider>
  );
}

const lookStyles = StyleSheet.create({
  card: { backgroundColor: tokens.colors.surfaceCard, ...tokens.elevation.card },
  edgeCard: { backgroundColor: tokens.colors.surfaceCard, ...tokens.elevation.soft },
  edge: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.borderFaint,
  },
  row: { flexDirection: "row", alignItems: "center" },
  icon: { position: "absolute", alignItems: "center" },
  text: { flex: 1 },
  value: { flexShrink: 1, maxWidth: "55%", textAlign: "right" },
  chevron: { position: "absolute" },
  rule: { position: "absolute", top: 0, height: StyleSheet.hairlineWidth, backgroundColor: tokens.colors.borderFaint },
});

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
  },
  stackedRow: { minHeight: 64 },
  card: { borderRadius: tokens.radius.md, backgroundColor: tokens.colors.surfaceCard, ...tokens.elevation.card },
  group: { borderRadius: tokens.radius.md, backgroundColor: tokens.colors.surfaceCard, ...tokens.elevation.card },
  // The rule starts under the words: the gutter, the 24-pt icon column and its 16-pt gap.
  rule: {
    height: StyleSheet.hairlineWidth * 2,
    marginLeft: tokens.space.md + 24 + tokens.space.md,
    backgroundColor: tokens.colors.borderDefault,
  },
  iconCol: { width: 24, alignItems: "center" },
  text: { flex: 1, gap: 2 },
  label: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
  small: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  subtitle: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  value: { ...rn(tokens.type.body), color: tokens.colors.textSecondary, flexShrink: 1, maxWidth: "55%" },
  danger: { color: tokens.colors.statusDangerText },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
});
