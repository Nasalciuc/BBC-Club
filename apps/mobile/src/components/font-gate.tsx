import { Fraunces_400Regular } from "@expo-google-fonts/fraunces";
import { Geist_400Regular, Geist_500Medium } from "@expo-google-fonts/geist";
import { GeistMono_400Regular, GeistMono_500Medium } from "@expo-google-fonts/geist-mono";
import {
  InterTight_400Regular,
  InterTight_500Medium,
  InterTight_600SemiBold,
  InterTight_700Bold,
} from "@expo-google-fonts/inter-tight";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { createContext, useContext, useEffect, useState, type ReactElement, type ReactNode } from "react";

import type { ClubFontFamily } from "@/constants/fonts";
import { FONT_WAIT_CAP_MS, fontGateOpen } from "@/lib/font-gate-logic";

/** constants/fonts.ts's list, as `useFonts` takes it: each family's file (the same files the Android build embeds). */
const CLUB_FONTS = {
  InterTight_400Regular,
  InterTight_500Medium,
  InterTight_600SemiBold,
  InterTight_700Bold,
  Fraunces_400Regular,
  Geist_400Regular,
  Geist_500Medium,
  GeistMono_400Regular,
  GeistMono_500Medium,
} satisfies Record<ClubFontFamily, number>;

/**
 * The root's font gate (ADR-IMPL-072): loads the club's fonts and says when the screens may draw — the fonts in, a
 * font failed, or `FONT_WAIT_CAP_MS` passed (lib/font-gate-logic.ts). The splash stays up until then and hides then.
 * It reads no session and no network: the Stack stays mounted throughout (f26870c).
 */
export function useFontGate(): boolean {
  const [fontsLoaded, fontError] = useFonts(CLUB_FONTS);
  const [capPassed, setCapPassed] = useState(false);
  const open = fontGateOpen({ fontsLoaded, fontError, capPassed });

  useEffect(() => {
    if (open) return;
    const cap = setTimeout(() => setCapPassed(true), FONT_WAIT_CAP_MS);
    return () => clearTimeout(cap);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    try {
      SplashScreen.hide();
    } catch {
      // Already hidden, or no native splash (the web).
    }
  }, [open]);

  return open;
}

const FontsReady = createContext(true);

/** Hands the gate's answer to every screen's `FontGate`. Outside it (a test, a screen rendered alone) nothing waits. */
export function FontsReadyProvider({ ready, children }: { ready: boolean; children: ReactNode }) {
  return <FontsReady.Provider value={ready}>{children}</FontsReady.Provider>;
}

/**
 * A screen's content, mounted once the gate opens: its text is first laid out in the club's fonts, not in the system
 * font React Native would keep for it. Until then the screen is its navigator's background, under the splash.
 */
export function FontGate({ children }: { children: ReactNode }) {
  return useContext(FontsReady) ? children : null;
}

/** The root Stack's `screenLayout`: every screen's content behind the gate; the navigator itself never waits. */
export function fontGateLayout({ children }: { children: ReactElement }): ReactElement {
  return <FontGate>{children}</FontGate>;
}
