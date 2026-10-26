/**
 * Where a destination's flight options stand (13, 04): read by `DestinationDetails`, which draws them, and by the
 * section that lines up under them (the landmarks, ADR-IMPL-064), so a re-measured look moves both. Pure — no React
 * Native — so the measures are tested against the images (`destination-geometry.test.ts`).
 */
import { tokens } from "@bbc/ui/tokens";

type TypeToken = (typeof tokens.type)[keyof typeof tokens.type];

type OptionsMeasures = {
  /** Where the component's own left edge stands on screen (Explore's sheet pads its content by the gutter). */
  inset: number;
  /** `Flight option(s)`: its role, its baseline, its pen on screen, and at least `minGap` under the summary's foot. */
  title: { type: TypeToken; baseline: number; left: number; minGap: number };
  /** The cards: their top, their edges' distance from the screen's, the gap between them. */
  cards: { top: number; left: number; right: number; gap: number };
};

/**
 * 13, under the sheet's content (16 under its top edge): `Flight option` 20.4 in on 241, at least 26.5 under the second
 * rule; the card from 254.5, 16.2 from either edge — inside the sheet's gutter. 04, under the sheet's top edge:
 * `Flight options` 17.93 in on 245.7; the cards from 255.2, 11.2 and 11.8 from the edges (as wide as the summary's
 * card), 4.9 apart.
 */
export const FLIGHT_OPTIONS = {
  route: {
    inset: tokens.space.gutter,
    title: { type: tokens.type.routeOptions, baseline: 241, left: 20.4, minGap: 26.5 },
    cards: { top: 254.5, left: 16.2, right: 16.2, gap: 4.9 },
  },
  page: {
    inset: 0,
    title: { type: tokens.type.placeOptions, baseline: 245.7, left: 17.93, minGap: 26.5 },
    cards: { top: 255.2, left: 11.2, right: 11.8, gap: 4.9 },
  },
} as const satisfies Record<"route" | "page", OptionsMeasures>;

/**
 * Where a look's flight options stand, for a section that lines up under them: the component's own left edge on screen
 * (`inset`), the title's role and its pen on screen, the title's baseline to the cards' top, and the cards' left edge on
 * screen.
 */
export function optionsColumn(look: "route" | "page"): {
  inset: number;
  title: { type: TypeToken; left: number };
  toCards: number;
  cardsLeft: number;
} {
  const m = FLIGHT_OPTIONS[look];
  return {
    inset: m.inset,
    title: { type: m.title.type, left: m.title.left },
    toCards: m.cards.top - m.title.baseline,
    cardsLeft: m.cards.left,
  };
}
