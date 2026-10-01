import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { MaterialSymbols_400Regular } from "@expo-google-fonts/material-symbols";
import { Fraunces_400Regular, Fraunces_600SemiBold } from "@expo-google-fonts/fraunces";
import { Geist_400Regular, Geist_500Medium } from "@expo-google-fonts/geist";
import { GeistMono_400Regular, GeistMono_500Medium } from "@expo-google-fonts/geist-mono";
import { Inter_400Regular, Inter_500Medium } from "@expo-google-fonts/inter";
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono";
import { SourceSerif4_400Regular } from "@expo-google-fonts/source-serif-4";
import { useFonts } from "expo-font";
import * as Linking from "expo-linking";
import { DarkTheme, Stack, ThemeProvider, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AppGate } from "@/components/app-gate";
import { Club } from "@/constants/club";
import { useSession } from "@/features/auth/client";
import { signOut } from "@/features/auth/flows";
import { clearPendingOtp } from "@/features/auth/otp-holder";
import { passwordStillPending, resolvePostAuthRoute } from "@/features/auth/session-gate";
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

/** Club dark chrome — avoids React Navigation's default light/white flash (Expo Router ThemeProvider). */
const clubDark = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Club.colors.black,
    card: Club.colors.black,
    primary: Club.colors.textOnDark,
    text: Club.colors.textOnDark,
    border: Club.colors.borderOnDark,
    notification: Club.colors.statusDanger,
  },
};

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { data: session, isPending: sessionPending } = useSession();
  // useSession() may yield data:null on a 429/5xx get-session — that is NOT signed-out.
  // gate() returns early on !session and never calls resolvePostAuthRoute; only onSessionRevoked
  // (apiFetch 401) and explicit signOut navigate to /sign-in.

  // Fonts swap in when ready (RN 0.72+); do not block Stack on useFonts (Expo Router migrate).
  useFonts({
    Inter_400Regular,
    Inter_500Medium,
    SourceSerif4_400Regular,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    Fraunces_400Regular,
    Fraunces_600SemiBold,
    Geist_400Regular,
    Geist_500Medium,
    GeistMono_400Regular,
    GeistMono_500Medium,
    MaterialSymbols_400Regular,
    Inter: Inter_400Regular,
    Newsreader: SourceSerif4_400Regular,
    "JetBrains Mono": JetBrainsMono_400Regular,
    Fraunces: Fraunces_400Regular,
    Geist: Geist_400Regular,
    "Geist Mono": GeistMono_400Regular,
  });

  // Hide splash on first paint — never wait for get-session (Better Auth has no client timeout).
  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);

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

  // Restore session → Explore. Effect only — never blocks first paint / Stack mount.
  useEffect(() => {
    if (sessionPending) return;

    let cancelled = false;

    async function gate() {
      const leaf = typeof segments[0] === "string" ? segments[0] : "index";

      if (!session) return;
      // Path A: an OTP session has no password yet. Checked before GATE_HOLD so a remount
      // cannot send that session to onboarding or Explore.
      if (leaf !== "set-password" && passwordStillPending()) {
        router.replace("/set-password");
        return;
      }
      if (GATE_HOLD.has(leaf) || AUTH_ENTRY.has(leaf)) return;

      const dest = await resolvePostAuthRoute();
      if (cancelled) return;
      if (leaf === "index") {
        router.replace(dest);
      }
    }

    void gate().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session, sessionPending, segments, router]);

  // Push device registration once an active session is present.
  useEffect(() => {
    if (!session || sessionPending) return;
    void registerPushDevice({ prompt: false }).catch(() => {
      // push is best-effort; the rest of the app works without a token
    });
  }, [session, sessionPending]);

  // Deep links: bbcclub://proposal/<id> | bbcclub://inbox — no secrets in the URL.
  useEffect(() => {
    if (!session || sessionPending) return;

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
  }, [session, sessionPending, router]);

  return (
    <View style={styles.shell}>
      <GestureHandlerRootView style={styles.phone}>
        <ThemeProvider value={clubDark}>
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
                  options={{
                    animation: "slide_from_right",
                    contentStyle: { backgroundColor: Club.colors.surfacePage },
                  }}
                />
                <Stack.Screen
                  name="request/[id]"
                  options={{
                    animation: "slide_from_right",
                    contentStyle: { backgroundColor: Club.colors.surfacePage },
                  }}
                />
                <Stack.Screen
                  name="request/confirmed"
                  options={{
                    animation: "fade",
                    contentStyle: { backgroundColor: Club.colors.surfacePage },
                  }}
                />
                <Stack.Screen
                  name="request/limited"
                  options={{
                    animation: "fade",
                    contentStyle: { backgroundColor: Club.colors.surfacePage },
                  }}
                />
                <Stack.Screen
                  name="settings"
                  options={{
                    animation: "slide_from_right",
                    contentStyle: { backgroundColor: Club.colors.surfacePage },
                  }}
                />
                <Stack.Screen
                  name="edit-profile"
                  options={{
                    animation: "slide_from_right",
                    contentStyle: { backgroundColor: Club.colors.surfacePage },
                  }}
                />
                <Stack.Screen
                  name="dev/gallery"
                  options={{
                    animation: "slide_from_right",
                    contentStyle: { backgroundColor: Club.colors.surfacePage },
                  }}
                />
              </Stack>
            </AppGate>
          </BottomSheetModalProvider>
        </ThemeProvider>
      </GestureHandlerRootView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: Club.colors.black,
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
