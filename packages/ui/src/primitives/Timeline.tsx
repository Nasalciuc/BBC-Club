import { StyleSheet, Text, View } from "react-native";
import { Icon } from "../icons";
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
  /** Current request status — drives which steps are done. `queued`, `not_sent` and `closed` keep every step hollow. */
  status: string;
  /** Server timeline events: a specialist's note on the current step replaces its caption. */
  events?: Event[];
  /** The line under the current step when its event has no note ("Review the quote with your specialist."). */
  currentCaption?: string | null;
  testID?: string;
};

function stepIndex(status: string): number {
  if (status === "closed" || status === "not_sent" || status === "queued") return -1;
  return STEPS.findIndex((s) => s.key === status);
}

/** The latest note for a step: a request quoted twice shows the second quote's note, not the first. */
function noteFor(key: StepKey, events: Event[]): string | null {
  for (let k = events.length - 1; k >= 0; k--) {
    const event = events[k];
    if (event?.status !== key) continue;
    const note = event.note?.trim();
    return note ? note : null;
  }
  return null;
}

/**
 * Figma 46:114: four milestones in a card. A done step has a check in a circle and a dark connector down to the next
 * done step; the current step says what happens now; future steps stay quiet (hollow, secondary). Review is a milestone
 * here, never a badge. Each step also says in words whether it is done, current or still to come — never the icon
 * alone (DESIGN.md, Accessibility).
 */
export function Timeline({ status, events = [], currentCaption = null, testID }: Props) {
  const current = stepIndex(status);

  return (
    <View testID={testID} style={styles.card}>
      {STEPS.map((step, i) => {
        const done = current >= i;
        const caption = i === current ? (noteFor(step.key, events) ?? currentCaption) : null;
        const last = i === STEPS.length - 1;
        const state = i < current ? "done" : i === current ? "current step" : "not yet";
        return (
          <View
            key={step.key}
            style={styles.row}
            testID={testID ? `${testID}.${step.key}` : undefined}
            accessible
            accessibilityLabel={`${step.label}, ${state}${caption ? `. ${caption}` : ""}`}
          >
            {last ? null : <View style={[styles.connector, current >= i + 1 && styles.connectorDone]} />}
            <View style={styles.marker}>
              <Icon
                name={done ? "circle-check" : "circle"}
                size={24}
                color={done ? tokens.colors.textPrimary : tokens.colors.borderDefault}
              />
            </View>
            <View style={styles.copy}>
              <Text style={[styles.label, !done && styles.labelQuiet]}>{step.label}</Text>
              {caption ? <Text style={styles.caption}>{caption}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const MARKER = 24;

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.card,
    padding: tokens.space.lg,
  },
  // 80 pt a step, as the frame draws it; a step grows (never clips) at larger text sizes.
  row: { flexDirection: "row", alignItems: "flex-start", gap: tokens.space.md, minHeight: 80 },
  marker: { width: MARKER, height: MARKER },
  // From the circle's foot to the next circle's head: the drawn circle sits 2 pt inside its 24 pt box.
  connector: {
    position: "absolute",
    left: MARKER / 2 - 0.5,
    top: MARKER - 2,
    bottom: -2,
    width: 1,
    backgroundColor: tokens.colors.borderDefault,
  },
  connectorDone: { backgroundColor: tokens.colors.textPrimary },
  copy: { flex: 1, gap: tokens.space.xxs },
  label: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
  labelQuiet: { color: tokens.colors.textSecondary },
  caption: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
});
