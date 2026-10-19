import { StyleSheet, Text, View, type DimensionValue, type ViewStyle } from "react-native";
import { Icon } from "../icons";
import { baselineOffset, belowBaseline, rn } from "../rn-type";
import { tokens } from "../tokens";
import type { StepState, TimelineStep } from "./status-copy";

export type { StepState, TimelineStep } from "./status-copy";

type Props = {
  /** The three steps in order; the screen works them out from the request (request-view-logic.ts). */
  steps: readonly TimelineStep[];
  testID?: string;
};

const SPOKEN: Record<StepState, string> = { done: "done", current: "current step", todo: "not yet" };

/**
 * 11, measured: the three marks centred 27.5 pt in from either end of the row and at its middle. A step reached: a
 * 21.4-pt navy disc with a white check. The step the request is at: a 16.6-pt navy dot, 2.2 pt of white, then a 3.2-pt
 * pale blue ring (27.5 across). A step to come: a 21.7-pt white disc in a 1.6-pt grey ring. The line between two marks
 * runs from edge to edge, 1.9 pt navy when the second is reached, else 2.2 pt grey. The names' baseline 26.1 pt under
 * the marks' centre, the days' 14.7 under that.
 */
const INSET = 27.5;
const DONE = 21.4;
const DOT = 16.6;
const GAP = 2.2;
const RING = 3.2;
const HALO = DOT + 2 * (GAP + RING);
const TODO = 21.7;
const TODO_RING = 1.6;
const LINE = { reached: 1.9, ahead: 2.2 } as const;
const LABEL_BELOW = 26.1;
const DATE_BELOW = 14.7;
/** The labels' boxes, centred under their marks; wide enough for `Quote ready` at 1.3× text. */
const LABEL_W = 120;

const CENTRE = HALO / 2;
const dateType = tokens.type.stepDate;
/** The row's height: the marks, the names and the days under them, whether or not there are days. */
export const TIMELINE_HEIGHT = CENTRE + LABEL_BELOW + DATE_BELOW + belowBaseline(dateType);
/** Where the names' baseline sits in the row: the screen measures what follows from there. */
export const TIMELINE_LABEL_BASELINE = CENTRE + LABEL_BELOW;

function radius(state: StepState): number {
  return state === "done" ? DONE / 2 : state === "current" ? HALO / 2 : TODO / 2;
}

/** Where each of the three columns' centres sits: in from the left, at the middle, in from the right. */
function at(i: number, half: number): ViewStyle {
  if (i === 0) return { left: INSET - half };
  if (i === 1) return { left: "50%" as DimensionValue, marginLeft: -half };
  return { right: INSET - half };
}

function Mark({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <View style={[styles.disc, styles.done]}>
        <Icon name="check" size={14.8} color={tokens.colors.textOnPhoto} strokeWidth={2.27} />
      </View>
    );
  }
  if (state === "current") {
    return (
      <View style={styles.halo}>
        <View style={styles.gap}>
          <View style={styles.dot} />
        </View>
      </View>
    );
  }
  return <View style={styles.todo} />;
}

/**
 * Request progress (11, 30–33; sheet 41, the horizontal stepper): Received → Quote ready → Booked. Each step says in
 * words whether it is done, current or still to come — never the mark alone (DESIGN.md).
 */
export function Timeline({ steps, testID }: Props) {
  const r = steps.map((s) => radius(s.state));
  return (
    <View testID={testID} style={styles.row}>
      {steps.slice(0, -1).map((step, i) => {
        const next = steps[i + 1];
        if (!next) return null;
        // The line is navy once the step it leads to is reached: done, or the one the request is at.
        const reached = next.state !== "todo";
        const thickness = reached ? LINE.reached : LINE.ahead;
        const span: ViewStyle =
          i === 0
            ? { left: INSET + (r[0] ?? 0), right: "50%" as DimensionValue, marginRight: r[1] ?? 0 }
            : { left: "50%" as DimensionValue, marginLeft: r[1] ?? 0, right: INSET + (r[2] ?? 0) };
        return (
          <View
            key={`line-${step.key}`}
            style={[
              styles.line,
              span,
              { top: CENTRE - thickness / 2, height: thickness },
              reached ? styles.lineReached : styles.lineAhead,
            ]}
          />
        );
      })}
      {steps.map((step, i) => {
        const quiet = step.state === "todo";
        const label = quiet ? styles.labelTodo : styles.label;
        return (
          <View
            key={step.key}
            style={[styles.step, at(i, LABEL_W / 2)]}
            pointerEvents="none"
            testID={testID ? `${testID}.${step.key}` : undefined}
            accessible
            accessibilityLabel={[step.label, SPOKEN[step.state], step.date].filter(Boolean).join(", ")}
          >
            <View style={[styles.mark, { left: LABEL_W / 2 - radius(step.state), top: CENTRE - radius(step.state) }]}>
              <Mark state={step.state} />
            </View>
            <Text style={[label, styles.words]} numberOfLines={1}>
              {step.label}
            </Text>
            {step.date ? (
              <Text style={[styles.date, styles.words]} numberOfLines={1}>
                {step.date}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const labelType = tokens.type.step;
const todoType = tokens.type.stepTodo;

const styles = StyleSheet.create({
  row: { height: TIMELINE_HEIGHT },
  line: { position: "absolute" },
  lineReached: { backgroundColor: tokens.colors.primary },
  lineAhead: { backgroundColor: tokens.colors.stepLine },
  mark: { position: "absolute" },
  disc: { width: DONE, height: DONE, borderRadius: DONE / 2, alignItems: "center", justifyContent: "center" },
  done: { backgroundColor: tokens.colors.primary },
  halo: {
    width: HALO,
    height: HALO,
    borderRadius: HALO / 2,
    backgroundColor: tokens.colors.stepRing,
    alignItems: "center",
    justifyContent: "center",
  },
  gap: {
    width: DOT + 2 * GAP,
    height: DOT + 2 * GAP,
    borderRadius: (DOT + 2 * GAP) / 2,
    backgroundColor: tokens.colors.surfaceCard,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: tokens.colors.primary },
  todo: {
    width: TODO,
    height: TODO,
    borderRadius: TODO / 2,
    borderWidth: TODO_RING,
    borderColor: tokens.colors.borderStrong,
    backgroundColor: tokens.colors.surfaceCard,
  },
  // Each step a column as wide as its words' box, its mark and words centred in it.
  step: { position: "absolute", top: 0, bottom: 0, width: LABEL_W },
  words: { position: "absolute", left: 0, right: 0, textAlign: "center" },
  label: {
    ...rn(labelType),
    color: tokens.colors.textPrimary,
    top: TIMELINE_LABEL_BASELINE - baselineOffset(labelType),
  },
  labelTodo: {
    ...rn(todoType),
    color: tokens.colors.textSecondary,
    top: TIMELINE_LABEL_BASELINE - baselineOffset(todoType),
  },
  date: {
    ...rn(dateType),
    color: tokens.colors.textSecondary,
    top: TIMELINE_LABEL_BASELINE + DATE_BELOW - baselineOffset(dateType),
  },
});
