import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, Linking, Platform } from "react-native";

import { SystemScreen } from "@/components/system-screen";
import { telHref } from "@/features/requests/confirmation-logic";
import { fetchAppConfig } from "@/lib/api";
import { gateFor, gateRetryDelayMs, maintenanceBody, openFirst, shouldRecheck, type Gate } from "@/lib/app-gate-logic";
import { env } from "@/lib/env";
import { stateCopy } from "@/lib/error-context";

/**
 * Forced update / maintenance (Figma 240:5129 / 240:5163). Children (Stack) stay mounted while config loads — never
 * return null / empty boot over the navigator (Expo Router: root must keep Stack).
 *
 * It asks /v1/app-config at launch and again (F033): after a failure at 5 s, 30 s and 2 min, then each time the app
 * comes back to the front; after an answer, when the app comes back to the front five minutes or more later. A failed
 * answer changes nothing on screen (fail open: an open app stays open, a page that is up stays up).
 */
export function AppGate({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<Gate>(null);
  // The maintenance page's `Try again`: asks at once, whatever the last answer was.
  const askNow = useRef<() => void>(() => undefined);
  const current = Constants.expoConfig?.version ?? "0.1.0";

  useEffect(() => {
    let alive = true;
    let asking = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const seen: { lastOkAt: number | null; lastFailedAt: number | null; attempts: number } = {
      lastOkAt: null,
      lastFailedAt: null,
      attempts: 0,
    };
    const stopTimer = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    // The next try after a failure, when it is due; a timer that fires early waits out the rest.
    const retryWhenDue = () => {
      const wait = gateRetryDelayMs(seen.attempts);
      if (wait === null || seen.lastFailedAt === null) return;
      timer = setTimeout(
        () => {
          timer = null;
          if (shouldRecheck({ ...seen, now: Date.now(), trigger: "retry" })) void ask();
          else retryWhenDue();
        },
        Math.max(1, seen.lastFailedAt + wait - Date.now()),
      );
    };
    const ask = async (): Promise<void> => {
      if (asking || !alive) return;
      asking = true;
      stopTimer();
      try {
        const result = await fetchAppConfig().catch(() => null);
        if (!alive) return;
        if (!result?.ok) {
          seen.lastFailedAt = Date.now();
          seen.attempts += 1;
          retryWhenDue();
          return;
        }
        seen.lastOkAt = Date.now();
        seen.attempts = 0;
        // `Try again` after the maintenance, or a minimum lowered again: the app opens where it was.
        setGate(gateFor(result.data, current, Platform.OS));
      } finally {
        asking = false;
      }
    };

    askNow.current = () => void ask();
    void ask();
    const foreground = AppState.addEventListener("change", (next) => {
      if (next === "active" && shouldRecheck({ ...seen, now: Date.now(), trigger: "foreground" })) void ask();
    });
    return () => {
      alive = false;
      stopTimer();
      foreground.remove();
      askNow.current = () => undefined;
    };
  }, [current]);

  // A call needs the club's verified number (EXPO_PUBLIC_SUPPORT_PHONE, in digits); without one, no button.
  const tel = telHref(env.EXPO_PUBLIC_SUPPORT_PHONE);
  const call = (testID: string) =>
    tel ? { testID, onPress: () => void Linking.openURL(tel).catch(() => undefined) } : null;

  if (gate?.kind === "update") {
    // Figma 240:5129: no way past it but the update — from this platform's store listing when the server names one,
    // else its web page, else the website (F039).
    const copy = stateCopy("update");
    const targets = gate.targets;
    // The page replaces the navigator, the root's light bar with it: its porcelain takes the dark glyphs.
    return (
      <>
        <StatusBar style="dark" />
        <SystemScreen
          testID="appGate.update"
          title={copy.title}
          body={copy.body}
          primary={{
            label: "Update app",
            testID: "appGate.update.cta",
            onPress: () => void openFirst(targets, (url) => Linking.openURL(url)),
          }}
          call={call("appGate.update.call")}
        />
      </>
    );
  }

  if (gate?.kind === "maintenance") {
    return (
      <>
        <StatusBar style="dark" />
        <SystemScreen
          testID="appGate.maintenance"
          title={stateCopy("maintenance").title}
          body={maintenanceBody(gate.value)}
          primary={{ label: "Try again", testID: "appGate.maintenance.retry", onPress: () => askNow.current() }}
          call={call("appGate.maintenance.call")}
        />
      </>
    );
  }

  return <>{children}</>;
}
