import { StyleSheet, Text, View } from "react-native";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

const STEPS = [
  { key: "received", label: "Received" },
  { key: "assigned", label: "Assigned" },
  { key: "quoted", label: "Quoted" },
  { key: "booked", label: "Booked" },
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
  testID?: string;
};

function stepIndex(status: string): number {
  if (status === "closed") return STEPS.findIndex((s) => s.key === "booked");
  if (status === "not_sent" || status === "queued") return -1;
  return STEPS.findIndex((s) => s.key === status);
}

function dateFor(key: StepKey, events: Event[]): string | null {
  const match = events.find((e) => e.status === key || (key === "booked" && e.status === "closed"));
  if (!match) return null;
  const d = new Date(match.at);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Four fixed request steps. Future steps stay hollow with an em dash. */
export function Timeline({ status, events = [], testID }: Props) {
  const current = stepIndex(status);

  return (
    <View testID={testID} style={styles.root}>
      {STEPS.map((step, i) => {
        const done = current >= i;
        const date = done ? dateFor(step.key, events) : null;
        return (
          <View key={step.key} style={styles.row} testID={testID ? `${testID}.${step.key}` : undefined}>
            <View style={[styles.dot, done ? styles.dotFilled : styles.dotHollow]} />
            <View style={styles.body}>
              <Text style={[styles.label, !done && styles.labelMuted]}>{step.label}</Text>
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
  label: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
  labelMuted: { color: tokens.colors.textTertiary },
  date: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  dateMuted: { color: tokens.colors.textTertiary },
});
