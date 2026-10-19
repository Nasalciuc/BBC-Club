import { Children, createContext, Fragment, isValidElement, type ReactNode, useContext } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";
import { Toggle } from "./Toggle";

/** True inside a `RowGroup`: the group draws the card and the rules between rows. */
const InGroup = createContext(false);

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
  toggle?: { value: boolean; onChange?: (next: boolean) => void; testID?: string; locked?: boolean };
  /** 1.0 prop, kept while its screens move to 3.0. */
  size?: "md" | "sm";
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
  testID,
}: Props) {
  const inGroup = useContext(InGroup);
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
 * A white card of rows (12, 34, 36): radius 16 with the card shadow, a light navy rule between rows that starts where
 * the words start.
 */
export function RowGroup({ children, testID }: { children: ReactNode; testID?: string }) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <InGroup.Provider value>
      <View style={styles.group} testID={testID}>
        {rows.map((row, i) => (
          <Fragment key={row.key ?? i}>
            {i > 0 ? <View style={styles.rule} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
    </InGroup.Provider>
  );
}

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
