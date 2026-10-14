import { type ReactNode, useState } from "react";
import { StyleSheet, Text, type TextInputProps, View } from "react-native";
import { rn } from "../rn-type";
import { tokens } from "../tokens";
import { SheetTextInput } from "./SheetTextInput";

type Props = Omit<TextInputProps, "style" | "placeholderTextColor"> & {
  label: string;
  /**
   * `mono`: the request sheet's `NAME`, `PHONE`, `EMAIL` (Figma 135:849), uppercased here; `caption`: the short sheets'
   * sentence-case labels as given (320:5969 `Phone number`, 320:5810 `Password`); `bodySm`: the password sheet's
   * (238:4974 `Current password`).
   */
  labelTone?: "mono" | "caption" | "bodySm";
  /** Figma State=Error (28:14): the danger border. The words that explain it sit under the field, in the screen. */
  error?: boolean;
  /** Inside the field at its right edge — the password's eye (238:4974). */
  trailing?: ReactNode;
  testID: string;
};

/**
 * Figma's text field (the field component 28:42 in its text and Phone states, 319:192): the label 8 pt over a white
 * 56-pt field with the field's 12-pt radius, the words 16 pt in — no magnifier, which belongs to search. Focus
 * strengthens the border to 1.5 pt `text-secondary`; an error is the danger border.
 */
export function TextField({
  label,
  labelTone = "mono",
  error = false,
  trailing,
  testID,
  multiline,
  onFocus,
  onBlur,
  accessibilityLabel,
  ...input
}: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text style={LABEL[labelTone]}>{labelTone === "mono" ? label.toUpperCase() : label}</Text>
      <View
        style={[
          styles.field,
          multiline && styles.fieldMulti,
          focused && !error && styles.focused,
          error && styles.error,
        ]}
      >
        <SheetTextInput
          {...input}
          testID={testID}
          accessibilityLabel={accessibilityLabel ?? label}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          placeholderTextColor={tokens.colors.textSecondary}
          style={styles.input}
        />
        {trailing}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: tokens.space.xs },
  labelMono: { ...rn(tokens.type.labelMono), color: tokens.colors.textSecondary },
  labelCaption: { ...rn(tokens.type.caption), color: tokens.colors.textPrimary },
  labelBodySm: { ...rn(tokens.type.bodySm), color: tokens.colors.textPrimary },
  field: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radius.field,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    backgroundColor: tokens.colors.surfaceCard,
  },
  // A note grows downward from the first line, which sits where a single line would.
  fieldMulti: { alignItems: "flex-start", paddingVertical: (56 - 2 - 25) / 2 },
  // 28:6: the border thickens to 1.5 pt; the padding gives up the half point so nothing inside moves.
  focused: { borderWidth: 1.5, borderColor: tokens.colors.textSecondary, paddingHorizontal: tokens.space.md - 0.5 },
  error: { borderColor: tokens.colors.statusDanger },
  input: {
    ...rn(tokens.type.body),
    color: tokens.colors.textPrimary,
    flex: 1,
    // A web <input> keeps its intrinsic width in a row; it may shrink instead.
    minWidth: 0,
    padding: 0,
    margin: 0,
    // The field's own border is the focus: no second ring around the words (a browser draws one on the web).
    outlineWidth: 0,
  },
});

const LABEL = { mono: styles.labelMono, caption: styles.labelCaption, bodySm: styles.labelBodySm } as const;
