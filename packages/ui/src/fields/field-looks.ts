import type { TextStyle } from "react-native";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Role = TextStyle & { fontSize: number; lineHeight: number };

/**
 * The request sheet's fields (06, 22, 23), measured from each field's top-left (pt): white on a hairline, radius 5; the
 * icon in its column, a rule from 6.8 under the top to 6.5 over the foot, the label in slate over the value in navy;
 * a picker's chevron at the right. A picker is 37.4 tall (`Depart`, `Return`, `Travelers`), a text field 36.8 (`Name`,
 * `Phone`, `Email`, `Note`).
 */
export type FieldLook = {
  height: number;
  radius: number;
  /** The icon's centre from the field's left, how far over the field's middle it sits, its box and line. */
  icon: { centre: number; rise: number; size: number; stroke: number };
  rule: { left: number; top: number; bottom: number };
  label: { left: number; baseline: number; role: Role; color: string };
  /** The value, and the placeholder's own smaller type and baseline where the image draws one (06's note). */
  value: { baseline: number; role: Role; placeholder?: Role; placeholderBaseline?: number };
  /** A picker's chevron: its centre from the field's right edge, how far under the middle, its box and line. */
  chevron: { right: number; drop: number; size: number; stroke: number };
};

// At phone size (ADR-IMPL-084): 54 tall, radius 8; a text field's icon 19 centred 22 in, the rule at 42 from 10 to 10,
// the label 50 in on 21, the value on 42.
// A picker's icon column is narrower, so a day with its year (`Nov 16, 2026`) keeps one line in half the width.
export const PICKER_REQUEST: FieldLook = {
  height: 54,
  radius: 8,
  icon: { centre: 19, rise: 0.2, size: 18, stroke: 1.6 },
  rule: { left: 36, top: 10, bottom: 10 },
  label: { left: 43, baseline: 21, role: rn(tokens.type.fieldLabel) as Role, color: tokens.colors.textLabel },
  value: { baseline: 42, role: rn(tokens.type.fieldValue) as Role },
  chevron: { right: 12, drop: 0.6, size: 13, stroke: 2 },
};

export const TEXT_REQUEST: FieldLook = {
  height: 54,
  radius: 8,
  icon: { centre: 22, rise: 0, size: 19, stroke: 1.6 },
  rule: { left: 42, top: 10, bottom: 10 },
  label: { left: 50, baseline: 21, role: rn(tokens.type.fieldLabel) as Role, color: tokens.colors.textLabel },
  value: {
    baseline: 42,
    role: rn(tokens.type.fieldValue) as Role,
    placeholder: rn(tokens.type.fieldPlaceholder) as Role,
    placeholderBaseline: 41,
  },
  chevron: { right: 18, drop: 0.2, size: 14, stroke: 2 },
};

/**
 * 35's password, measured from the field's top-left (pt): white on a hairline, 45.6 tall, radius 7.5; the filled lock
 * 21.5 pt, its box's middle 23.76 in and 0.83 under the field's; `Password` alone in the field — its placeholder, the
 * typed dots in its place — 50.7 in on 27.94.
 */
export const TEXT_DELETE = {
  height: 45.6,
  radius: 7.5,
  icon: { centre: 23.76, drop: 0.83, size: 21.5 },
  value: { left: 50.7, baseline: 27.94, role: rn(tokens.type.deleteField) as Role },
} as const;
