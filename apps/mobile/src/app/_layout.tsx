import { MaterialSymbols_400Regular } from "@expo-google-fonts/material-symbols";
import { Inter_400Regular, Inter_500Medium } from "@expo-google-fonts/inter";
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono";
import { SourceSerif4_400Regular } from "@expo-google-fonts/source-serif-4";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { Club } from "@/constants/club";
import { useSession } from "@/features/auth/client";
import { clearPendingOtp } from "@/features/auth/otp-holder";
import { resolvePostAuthRoute } from "@/features/auth/session-gate";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export const unstable_settings = {
  initialRouteName: "index",
};

const AUTH_ENTRY = new Set(["sign-in", "join", "reset-password"]);

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { data: session, isPending: sessionPending } = useSession();
  const [gateReady, setGateReady] = useState(false);

  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    SourceSerif4_400Regular,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    MaterialSymbols_400Regular,
  });

  useEffect(() => {
    if (loaded || error) {
      void SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  useEffect(() => () => clearPendingOtp(), []);

  // Restore session → waitlist vs home. Do not interrupt mid join/reset (set-password still needed).
  useEffect(() => {
    if (sessionPending || (!loaded && !error)) return;

    let cancelled = false;

    async function gate() {
      const leaf = typeof segments[0] === "string" ? segments[0] : "index";

      if (!session) {
        if (!cancelled) setGateReady(true);
        return;
      }

      // Mid Path A / reset: session may exist before password is set.
      if (leaf === "set-password" || leaf === "verify-code") {
        if (!cancelled) setGateReady(true);
        return;
      }

      // Stay on other auth screens until the screen itself navigates post-success.
      if (AUTH_ENTRY.has(leaf)) {
        if (!cancelled) setGateReady(true);
        return;
      }

      const dest = await resolvePostAuthRoute();
      if (cancelled) return;
      if (leaf === "index") {
        router.replace(dest);
      } else if (leaf === "home" && dest === "/waitlist") {
        router.replace("/waitlist");
      } else if (leaf === "waitlist" && dest === "/home") {
        router.replace("/home");
      }
      setGateReady(true);
    }

    void gate();
    return () => {
      cancelled = true;
    };
  }, [session, sessionPending, loaded, error, segments, router]);

  if ((!loaded && !error) || sessionPending || !gateReady) {
    return null;
  }

  return (
    <View style={styles.shell}>
      <GestureHandlerRootView style={styles.phone}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Club.colors.black },
            animation: "fade",
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="join" />
          <Stack.Screen name="verify-code" />
          <Stack.Screen name="set-password" />
          <Stack.Screen name="reset-password" />
          <Stack.Screen name="home" />
          <Stack.Screen name="waitlist" />
        </Stack>
      </GestureHandlerRootView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: Club.colors.surfaceMuted,
  },
  phone: {
    flex: 1,
    backgroundColor: Club.colors.black,
    ...(Platform.OS === "web"
      ? {
          width: "100%",
          maxWidth: Club.layout.phoneMaxWidth,
          alignSelf: "center" as const,
        }
      : {}),
  },
});
