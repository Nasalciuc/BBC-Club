import Constants from "expo-constants";
import { Linking } from "react-native";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button, tokens, rn } from "@bbc/ui";

import { fetchAppConfig } from "@/lib/api";
import { env } from "@/lib/env";

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
    return (
      <View testID="appGate.update" style={styles.root}>
        <Text style={styles.wordmark}>BuyBusinessClass Club</Text>
        <Text style={styles.title}>{"We've improved the app."}</Text>
        <Text style={styles.body}>Please update to keep requesting fares.</Text>
        <Button
          testID="appGate.update.cta"
          label="Update"
          shape="card"
          onPress={() => void Linking.openURL("https://buybusinessclass.com")}
        />
        {env.EXPO_PUBLIC_SUPPORT_PHONE ? (
          <Pressable
            testID="appGate.update.call"
            accessibilityRole="button"
            onPress={() => void Linking.openURL(`tel:${env.EXPO_PUBLIC_SUPPORT_PHONE}`)}
          >
            <Text style={styles.link}>{`Need a fare now? Call ${env.EXPO_PUBLIC_SUPPORT_PHONE}`}</Text>
          </Pressable>
        ) : null}
        <Text style={styles.version}>{`VERSION ${current} (${build})`}</Text>
      </View>
    );
  }

  if (blocked === "maintenance") {
    return (
      <View testID="appGate.maintenance" style={styles.root}>
        <Text style={styles.wordmark}>BuyBusinessClass Club</Text>
        <Text style={styles.title}>Back in a moment.</Text>
        <Text style={styles.body}>
          {maintenanceCopy ? `Expected back at ${maintenanceCopy}` : "We're making a quick improvement."}
        </Text>
        {env.EXPO_PUBLIC_SUPPORT_PHONE ? (
          <Button
            testID="appGate.maintenance.call"
            label={`Call ${env.EXPO_PUBLIC_SUPPORT_PHONE}`}
            variant="ghost"
            shape="card"
            onPress={() => void Linking.openURL(`tel:${env.EXPO_PUBLIC_SUPPORT_PHONE}`)}
          />
        ) : null}
        <Text style={styles.caption}>Specialists answer 24/7, even now.</Text>
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
  wordmark: { ...rn(tokens.type.headline), color: tokens.colors.textPrimary, textAlign: "center" },
  title: { ...rn(tokens.type.title), color: tokens.colors.textPrimary, textAlign: "center" },
  body: { ...rn(tokens.type.body), color: tokens.colors.textSecondary, textAlign: "center" },
  link: { ...rn(tokens.type.bodySm), color: tokens.colors.primary, textAlign: "center" },
  caption: { ...rn(tokens.type.caption), color: tokens.colors.textTertiary, textAlign: "center" },
  version: { ...rn(tokens.type.labelMono), color: tokens.colors.textTertiary, textAlign: "center" },
});
