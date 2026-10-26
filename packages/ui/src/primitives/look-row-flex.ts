import type { TextStyle, ViewStyle } from "react-native";
import { tokens } from "../tokens";

/**
 * How a look row (ListRow's `LookRow`: 12, 34, 36, 05) shares its line between the label's column and the value —
 * pure, so it is tested without React Native. DESIGN.md (Layout): nothing truncates.
 *
 * Beside a value the label keeps its own line: its column starts from the label's width, never gives any of it up and
 * grows into what the value leaves. The value — at most 55% of the row, `xs` clear of the label — is what gives way:
 * too long for what is left (a member's own name, a long city at 1.3× text), it wraps and the row grows. Where both fit,
 * as at every size the images draw, the value ends where the screen ends it and nothing moves.
 *
 * With a subtitle (34's Notifications) the column takes what the value leaves, exactly as before: its subtitle wraps
 * under the label where it must, and the value keeps its word. Without a value (a toggle, a chevron alone) the column
 * takes the row.
 */
export function lookRowFlex(beside: { value: boolean; subtitle: boolean }): { text: ViewStyle; value: TextStyle } {
  const keepsLabel = beside.value && !beside.subtitle;
  return {
    text: keepsLabel ? { flexGrow: 1, flexShrink: 0 } : { flex: 1 },
    value: { flexShrink: 1, maxWidth: "55%", marginLeft: keepsLabel ? tokens.space.xs : 0 },
  };
}
