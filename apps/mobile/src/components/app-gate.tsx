import Constants from "expo-constants";
import { useEffect, useState, type ReactNode } from "react";
import { Linking } from "react-native";

import { SystemScreen } from "@/components/system-screen";
import { telHref } from "@/features/requests/confirmation-logic";
import { fetchAppConfig } from "@/lib/api";
import { compareSemver, maintenanceBody } from "@/lib/app-gate-logic";
import { env } from "@/lib/env";
import { stateCopy } from "@/lib/error-context";

type Gate = { kind: "update" } | { kind: "maintenance"; value: string } | null;

/**
 * Forced update / maintenance (Figma 240:5129 / 240:5163). Children (Stack) stay mounted while config loads — never
 * return null / empty boot over the navigator (Expo Router: root must keep Stack).
 */
export function AppGate({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<Gate>(null);
  const [ask, setAsk] = useState(0);
  const current = Constants.expoConfig?.version ?? "0.1.0";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchAppConfig();
      if (cancelled || !result.ok) return;
      if (compareSemver(result.data.minSupportedVersion, current) > 0) {
        setGate({ kind: "update" });
      } else if (result.data.maintenance) {
        setGate({ kind: "maintenance", value: result.data.maintenance });
      } else {
        // `Try again` after the maintenance: the app opens where it was.
        setGate(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [current, ask]);

  // A call needs the club's verified number (EXPO_PUBLIC_SUPPORT_PHONE, in digits); without one, no button.
  const tel = telHref(env.EXPO_PUBLIC_SUPPORT_PHONE);
  const call = (testID: string) =>
    tel ? { testID, onPress: () => void Linking.openURL(tel).catch(() => undefined) } : null;

  if (gate?.kind === "update") {
    // Figma 240:5129: no way past it but the update.
    const copy = stateCopy("update");
    return (
      <SystemScreen
        testID="appGate.update"
        title={copy.title}
        body={copy.body}
        primary={{
          label: "Update app",
          testID: "appGate.update.cta",
          onPress: () => void Linking.openURL("https://buybusinessclass.com").catch(() => undefined),
        }}
        call={call("appGate.update.call")}
      />
    );
  }

  if (gate?.kind === "maintenance") {
    return (
      <SystemScreen
        testID="appGate.maintenance"
        title={stateCopy("maintenance").title}
        body={maintenanceBody(gate.value)}
        primary={{ label: "Try again", testID: "appGate.maintenance.retry", onPress: () => setAsk((n) => n + 1) }}
        call={call("appGate.maintenance.call")}
      />
    );
  }

  return <>{children}</>;
}
