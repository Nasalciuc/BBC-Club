import { Fragment } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";
import type { StepState, TimelineStep } from "./status-copy";

export type { StepState, TimelineStep } from "./status-copy";

type Props = {
  /** The steps in order; the screen works them out from the request (request-view-logic.ts). */
  steps: readonly TimelineStep[];
  testID?: string;
};

const SPOKEN: Record<StepState, string> = { done: "done", current: "current step", todo: "not yet" };

/** 24 pt circles; the current one is a 22-pt dot in a 4-pt ring, so the row is 30 pt tall. */
const MARK = 24;
const RING = 4;
const DOT = 22;
const ROW = DOT + RING * 2;
const LINE = 2;

function Marker({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <View style={[styles.mark, styles.done]}>
        <Icon name="check" size={14} color={tokens.colors.textOnPhoto} strokeWidth={3} />
      </View>
    );
  }
  if (state === "current") {
    return (
      <View style={styles.ring}>
        <View style={styles.dot} />
      </View>
    );
  }
  return <View style={[styles.mark, styles.todo]} />;
}

/**
 * Request progress (11, 30–33; sheet 41, the horizontal stepper): Received → Quote ready → Booked. A step reached is a
 * navy circle with a white check and its day under its name; the step the request is at, the navy dot in a light ring;
 * a step to come, a hollow circle, its name in slate. The line between two steps is navy once the second is reached.
 * Each step says in words whether it is done, current or still to come — never the circle alone (DESIGN.md).
 */
export function Timeline({ steps, testID }: Props) {
  return (
    <View testID={testID} style={styles.row}>
      {steps.map((step, i) => {
        const next = steps[i + 1];
        // A segment is navy when the step it leads to is reached: done, or the one the request is at.
        const reached = next ? next.state !== "todo" : false;
        const quiet = step.state === "todo";
        return (
          <Fragment key={step.key}>
            <View
              style={styles.step}
              testID={testID ? `${testID}.${step.key}` : undefined}
              accessible
              accessibilityLabel={[step.label, SPOKEN[step.state], step.date].filter(Boolean).join(", ")}
            >
              {/* The circle with half a line on either side, so the line runs from circle to circle whatever the
                  words' widths. */}
              <View style={styles.markRow}>
                <View style={[styles.half, i > 0 && lineTone(step.state !== "todo")]} />
                <Marker state={step.state} />
                <View style={[styles.half, next && lineTone(reached)]} />
              </View>
              <Text style={[styles.label, quiet && styles.labelQuiet]}>{step.label}</Text>
              {step.date ? <Text style={styles.date}>{step.date}</Text> : null}
            </View>
            {next ? <View style={[styles.link, lineTone(reached)]} /> : null}
          </Fragment>
        );
      })}
    </View>
  );
}

const lineTone = (reached: boolean) => (reached ? styles.lineReached : styles.lineAhead);

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start" },
  // Each step as wide as its words, its circle centred over them.
  step: { alignItems: "center", gap: tokens.space.xxs },
  markRow: {
    alignSelf: "stretch",
    height: ROW,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: tokens.space.xxs,
  },
  half: { flex: 1, height: LINE },
  // Between two steps: the line at the circles' middle.
  link: { flex: 1, height: LINE, marginTop: ROW / 2 - LINE / 2 },
  lineReached: { backgroundColor: tokens.colors.primary },
  lineAhead: { backgroundColor: tokens.colors.borderDefault },
  mark: { width: MARK, height: MARK, borderRadius: tokens.radius.pill, alignItems: "center", justifyContent: "center" },
  done: { backgroundColor: tokens.colors.primary },
  todo: { backgroundColor: tokens.colors.surfaceCard, borderWidth: 2, borderColor: tokens.colors.borderDefault },
  ring: {
    width: ROW,
    height: ROW,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.borderDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: { width: DOT, height: DOT, borderRadius: tokens.radius.pill, backgroundColor: tokens.colors.primary },
  label: { ...rn(tokens.type.labelStrong), color: tokens.colors.textPrimary, textAlign: "center" },
  labelQuiet: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  date: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary, textAlign: "center" },
});
