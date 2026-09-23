import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { MaterialSymbols_400Regular } from "@expo-google-fonts/material-symbols";
import { Inter_400Regular, Inter_500Medium } from "@expo-google-fonts/inter";
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono";
import { SourceSerif4_400Regular } from "@expo-google-fonts/source-serif-4";
import { useFonts } from "expo-font";
import * as Linking from "expo-linking";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AppGate } from "@/components/app-gate";
import { Club } from "@/constants/club";
import { useSession } from "@/features/auth/client";
import { signOut } from "@/features/auth/flows";
import { clearPendingOtp } from "@/features/auth/otp-holder";
import { resolvePostAuthRoute } from "@/features/auth/session-gate";
import { routeFromDeepLink } from "@/lib/deeplinks";
import { registerPushDevice } from "@/lib/push";
import { onSessionRevoked } from "@/lib/session-events";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export const unstable_settings = {
  initialRouteName: "index",
};

const AUTH_ENTRY = new Set(["sign-in", "join", "reset-password"]);
/** Screens that own their own post-auth navigation (password, OTP, first-run prefs). */
const GATE_HOLD = new Set(["set-password", "verify-code", "onboarding"]);

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
    // Aliases so @bbc/ui rn() family names resolve without rewriting entry screens.
    Inter: Inter_400Regular,
    Newsreader: SourceSerif4_400Regular,
    "JetBrains Mono": JetBrainsMono_400Regular,
  });

  useEffect(() => {
    if (loaded || error) {
      void SplashScreen.hideAsync().catch(() => {
        // already hidden, or never shown
      });
    }
  }, [loaded, error]);

  useEffect(() => () => clearPendingOtp(), []);

  // Revoked session (apiFetch 401 on non-auth routes) → same clear as profile sign-out.
  useEffect(() => {
    let active = true;
    let handling = false;
    const unsubscribe = onSessionRevoked(() => {
      if (handling) return;
      handling = true;
      void (async () => {
        try {
          await signOut();
          if (active) router.replace("/sign-in");
        } finally {
          handling = false;
        }
      })();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [router]);

  // Restore session → Explore. Do not interrupt mid join/reset (set-password still needed).
  useEffect(() => {
    if (sessionPending || (!loaded && !error)) return;

    let cancelled = false;

    async function gate() {
      const leaf = typeof segments[0] === "string" ? segments[0] : "index";

      if (!session) {
        if (!cancelled) setGateReady(true);
        return;
      }

      // Mid Path A / reset / first-run prefs: stay put until the screen navigates.
      if (GATE_HOLD.has(leaf)) {
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
      }
      setGateReady(true);
    }

    void gate().catch(() => {
      if (!cancelled) setGateReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [session, sessionPending, loaded, error, segments, router]);

  // Push device registration once an active session is present.
  useEffect(() => {
    if (!session || !gateReady) return;
    void registerPushDevice().catch(() => {
      // push is best-effort; the rest of the app works without a token
    });
  }, [session, gateReady]);

  // Deep links: bbcclub://proposal/<id> | bbcclub://inbox — no secrets in the URL.
  useEffect(() => {
    if (!session || !gateReady) return;

    function handle(url: string) {
      const dest = routeFromDeepLink(url);
      if (dest) router.push(dest);
    }

    const initial = Linking.getInitialURL();
    void initial.then((url) => {
      if (url) handle(url);
    });

    const sub = Linking.addEventListener("url", (event) => handle(event.url));
    return () => sub.remove();
  }, [session, gateReady, router]);

  if ((!loaded && !error) || sessionPending || !gateReady) {
    return null;
  }

  return (
    <View style={styles.shell}>
      <GestureHandlerRootView style={styles.phone}>
        <BottomSheetModalProvider>
          <AppGate>
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
              <Stack.Screen
                name="onboarding"
                options={{ contentStyle: { backgroundColor: Club.colors.surfacePage } }}
              />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="fare/[id]"
                options={{ animation: "slide_from_right", contentStyle: { backgroundColor: Club.colors.surfacePage } }}
              />
              <Stack.Screen
                name="request/[id]"
                options={{ animation: "slide_from_right", contentStyle: { backgroundColor: Club.colors.surfacePage } }}
              />
              <Stack.Screen
                name="notifications"
                options={{ animation: "slide_from_right", contentStyle: { backgroundColor: Club.colors.surfacePage } }}
              />
              <Stack.Screen
                name="dev/gallery"
                options={{ animation: "slide_from_right", contentStyle: { backgroundColor: Club.colors.surfacePage } }}
              />
            </Stack>
          </AppGate>
        </BottomSheetModalProvider>
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
