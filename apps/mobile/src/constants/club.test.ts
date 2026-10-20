import { describe, expect, test } from "bun:test";

import { Club } from "./club";

/**
 * The entry stays exactly as 1.0 (ADR-IMPL-046, ADR-IMPL-047) while the club moves to 3.0 (ADR-IMPL-055). Its values
 * live in `club.ts`, written by hand; this pins every one of them, so a change to the entry is a change to this test,
 * made on purpose and named in its PR — never a side effect of the club's tokens.
 */
describe("the entry's own values (Club)", () => {
  test("colours", () => {
    expect(Club.colors).toEqual({
      black: "#000000",
      primary: "#1E293B",
      surfacePanel: "#1E293B",
      surfaceCard: "#FFFFFF",
      surfaceMuted: "#334155",
      textPrimary: "#1E293B",
      textSecondary: "#64748B",
      textTertiary: "#94A3B8",
      textOnDark: "#F8FAFC",
      textOnDarkMuted: "#94A3B8",
      actionInverted: "#F8FAFC",
      statusDanger: "#B42318",
      borderDefault: "#E2E8F0",
      borderOnDark: "rgba(248,250,252,0.35)",
      heroDim: "rgba(30,41,59,0.4)",
      scrim: ["transparent", "rgba(30,41,59,0.8)", "#1E293B"],
    });
  });

  test("spacing, radii and the column", () => {
    expect(Club.space).toEqual({ xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 48, gutter: 24 });
    expect(Club.radius).toEqual({ badge: 4, field: 12, card: 12, panel: 24, pill: 999 });
    expect(Club.layout).toEqual({ phoneMaxWidth: 430 });
  });

  test("type: the 1.0 roles in Fraunces, Geist and Geist Mono", () => {
    const role = <W extends "400" | "500">(
      fontFamily: string,
      fontSize: number,
      fontWeight: W,
      lineHeight: number,
      letterSpacing: number,
    ) => ({ fontFamily, fontSize, fontWeight, lineHeight, letterSpacing });
    expect(Club.type).toEqual({
      display: role("Fraunces_400Regular", 34, "400", 37, -0.4),
      headline: role("Fraunces_400Regular", 28, "400", 32, -0.3),
      title: role("Fraunces_400Regular", 20, "400", 24, 0),
      titleSm: role("Fraunces_400Regular", 16, "400", 20, 0),
      body: role("Geist_400Regular", 17, "400", 25, 0),
      bodySm: role("Geist_400Regular", 15, "400", 21, 0),
      caption: role("Geist_400Regular", 13, "400", 18, 0),
      button: role("Geist_500Medium", 17, "500", 17, 0),
      labelMono: role("GeistMono_500Medium", 11, "500", 14, 1.5),
      factsMono: role("GeistMono_400Regular", 12, "400", 17, 1),
      tabMono: role("GeistMono_500Medium", 11, "500", 13, 1),
    });
  });

  test("motion: the entrance's fade and rise", () => {
    expect(Club.motion).toEqual({ entrance: 900, rise: 12 });
  });
});
