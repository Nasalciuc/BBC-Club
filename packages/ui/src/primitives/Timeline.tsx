import { StyleSheet, Text, View } from "react-native";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

const STEPS = [
  { key: "received", label: "Request received" },
  { key: "assigned", label: "Specialist review" },
  { key: "quoted", label: "Quote ready" },
  { key: "booked", label: "Booked by phone" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

type Event = {
  status: string;
  at: string;
  note?: string | null;
};

type Props = {
  /** Current request status — drives which steps are filled. */
  status: string;
  /** Server timeline events; used for dates on completed steps. */
  events?: Event[];
  /** Frame caption for the current step when the event itself has no note. */
  currentCaption?: string | null;
  testID?: string;
};

function stepIndex(status: string): number {
  if (status === "closed" || status === "not_sent" || status === "queued") return -1;
  return STEPS.findIndex((s) => s.key === status);
}

function dateFor(key: StepKey, events: Event[]): string | null {
  const match = events.find((e) => e.status === key);
  if (!match) return null;
  const d = new Date(match.at);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Four fixed request steps. Future steps stay hollow with an em dash. */
function noteFor(key: StepKey, events: Event[]): string | null {
  const match = events.find((e) => e.status === key);
  const note = match?.note?.trim();
  return note ? note : null;
}

export function Timeline({ status, events = [], currentCaption = null, testID }: Props) {
  const current = stepIndex(status);

  return (
    <View testID={testID} style={styles.root}>
      {STEPS.map((step, i) => {
        const done = current >= i;
        const date = done ? dateFor(step.key, events) : null;
        const caption = i === current ? (noteFor(step.key, events) ?? currentCaption) : null;
        return (
          <View key={step.key} style={styles.row} testID={testID ? `${testID}.${step.key}` : undefined}>
            <View style={[styles.dot, done ? styles.dotFilled : styles.dotHollow]} />
            <View style={styles.body}>
              <View style={styles.copy}>
                <Text style={[styles.label, !done && styles.labelMuted]}>{step.label}</Text>
                {caption ? <Text style={styles.caption}>{caption}</Text> : null}
              </View>
              <Text style={[styles.date, !done && styles.dateMuted]}>{done ? (date ?? "—") : "—"}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: tokens.space.md },
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  dot: {
    width: 12,
    height: 12,
    borderRadius: tokens.radius.pill,
    borderWidth: 1.5,
  },
  dotFilled: {
    backgroundColor: tokens.colors.primary,
    borderColor: tokens.colors.primary,
  },
  dotHollow: {
    backgroundColor: "transparent",
    borderColor: tokens.colors.borderDefault,
  },
  body: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: tokens.space.sm },
  copy: { flex: 1, gap: tokens.space.xxs },
  label: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
  caption: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary },
  labelMuted: { color: tokens.colors.textTertiary },
  date: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  dateMuted: { color: tokens.colors.textTertiary },
});
