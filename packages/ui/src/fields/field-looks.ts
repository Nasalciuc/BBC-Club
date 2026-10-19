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

export const PICKER_REQUEST: FieldLook = {
  height: 37.4,
  radius: 5,
  icon: { centre: 17.3, rise: 0.2, size: 14.5, stroke: 1.5 },
  rule: { left: 32.5, top: 6.8, bottom: 6.5 },
  label: { left: 39, baseline: 15.48, role: rn(tokens.type.fieldLabel) as Role, color: tokens.colors.textLabel },
  value: { baseline: 30.05, role: rn(tokens.type.fieldValue) as Role },
  chevron: { right: 15.7, drop: 0.6, size: 11, stroke: 2.04 },
};

export const TEXT_REQUEST: FieldLook = {
  height: 36.8,
  radius: 5,
  icon: { centre: 16.9, rise: 0, size: 14.5, stroke: 1.5 },
  rule: { left: 33.2, top: 6.8, bottom: 6.5 },
  label: { left: 40.33, baseline: 15.5, role: rn(tokens.type.fieldLabel) as Role, color: tokens.colors.textLabel },
  value: {
    baseline: 30.4,
    role: rn(tokens.type.fieldValue) as Role,
    placeholder: rn(tokens.type.fieldPlaceholder) as Role,
    placeholderBaseline: 28.56,
  },
  chevron: { right: 15.7, drop: 0.2, size: 11, stroke: 2.04 },
};
