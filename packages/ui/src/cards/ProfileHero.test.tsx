/**
 * Profile's hero (12) sets the member's own name, which the Name sheet takes up to 80 characters: the name wraps and the
 * identity block grows — never cut (DESIGN.md, Layout: "nothing truncates but one-line titles in carousels"). The hero
 * holds no state, so it is called as a function and its tree read; React Native and the photograph's primitives stand in
 * as plain names. The name here is made up.
 */
import { describe, expect, it, mock } from "bun:test";
import { isValidElement, type ReactElement, type ReactNode } from "react";

mock.module("react-native", () => ({
  Platform: { OS: "ios" },
  StyleSheet: { create: <T,>(styles: T) => styles, absoluteFill: {} },
  Text: "Text",
  View: "View",
}));
mock.module("../primitives/Avatar", () => ({ Avatar: "Avatar" }));
mock.module("../primitives/Photo", () => ({ Photo: "Photo" }));

const { ProfileHero } = await import("./ProfileHero");

type Props = { children?: ReactNode; numberOfLines?: number; accessibilityRole?: string };

/** Every element in the tree the hero returns, depth first. */
function elements(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}

describe("ProfileHero — the member's own name (12)", () => {
  it("is the header, with no line limit: a long name wraps and the block grows", () => {
    const name = "Maria Fernanda de los Angeles Garcia-Hernandez Montgomery-Fitzgerald";
    const tree = ProfileHero({
      name,
      home: "Flies from JFK",
      initials: "MG",
      image: null,
      fallback: null,
      topInset: 47,
      testID: "profile.hero",
    });
    const header = elements(tree).find((e) => e.props.accessibilityRole === "header");
    expect(header?.props.children).toBe(name);
    expect(header?.props.numberOfLines).toBeUndefined();
  });
});
