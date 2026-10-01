import Constants from "expo-constants";
import { Linking } from "react-native";
import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { StateMessage, tokens, rn } from "@bbc/ui";

import { fetchAppConfig } from "@/lib/api";
import { env } from "@/lib/env";
import { stateCopy } from "@/lib/error-context";

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number(n) || 0);
  const pb = b.split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function formatMaintenance(raw: string): string {
  const iso = Date.parse(raw);
  if (Number.isNaN(iso)) return raw;
  return new Date(iso).toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}

/**
 * Forced update / maintenance overlay. Children (Stack) stay mounted while config loads —
 * never return null / empty boot over the navigator (Expo Router: root must keep Stack).
 */
export function AppGate({ children }: { children: ReactNode }) {
  const [blocked, setBlocked] = useState<"update" | "maintenance" | null>(null);
  const [maintenanceCopy, setMaintenanceCopy] = useState<string | null>(null);
  const current = Constants.expoConfig?.version ?? "0.1.0";
  const build = Constants.expoConfig?.ios?.buildNumber ?? "18";

  useEffect(() => {
    void (async () => {
      const result = await fetchAppConfig();
      if (!result.ok) return;
      if (compareSemver(result.data.minSupportedVersion, current) > 0) {
        setBlocked("update");
      } else if (result.data.maintenance) {
        setBlocked("maintenance");
        setMaintenanceCopy(formatMaintenance(result.data.maintenance));
      }
    })();
  }, [current]);

  if (blocked === "update") {
    const copy = stateCopy("update");
    const phone = env.EXPO_PUBLIC_SUPPORT_PHONE;
    return (
      <View testID="appGate.update" style={styles.root}>
        <Text style={styles.wordmark}>BUYBUSINESSCLASS</Text>
        <StateMessage
          testID="appGate.update.message"
          variant="error"
          title={copy.title}
          body={copy.body}
          primary={{
            label: "Update",
            testID: "appGate.update.cta",
            onPress: () => void Linking.openURL("https://buybusinessclass.com"),
          }}
          secondary={
            phone
              ? {
                  label: `Need a fare now? Call ${phone}`,
                  testID: "appGate.update.call",
                  onPress: () => void Linking.openURL(`tel:${phone}`),
                }
              : undefined
          }
        />
        <Text style={styles.version}>{`VERSION ${current} (${build})`}</Text>
      </View>
    );
  }

  if (blocked === "maintenance") {
    const copy = stateCopy("maintenance");
    const phone = env.EXPO_PUBLIC_SUPPORT_PHONE;
    return (
      <View testID="appGate.maintenance" style={styles.root}>
        <Text style={styles.wordmark}>BUYBUSINESSCLASS</Text>
        <StateMessage
          testID="appGate.maintenance.message"
          variant="error"
          title={copy.title}
          body={maintenanceCopy ? `Expected back at ${maintenanceCopy}` : copy.body}
          primary={
            phone
              ? {
                  label: `Call ${phone}`,
                  testID: "appGate.maintenance.call",
                  onPress: () => void Linking.openURL(`tel:${phone}`),
                }
              : undefined
          }
        />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.colors.surfacePage,
    padding: tokens.space.lg,
    justifyContent: "center",
    gap: tokens.space.md,
  },
  wordmark: { ...rn(tokens.type.labelMono), color: tokens.colors.textPrimary, textAlign: "center" },
  version: { ...rn(tokens.type.labelMono), color: tokens.colors.textTertiary, textAlign: "center" },
});
