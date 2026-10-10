import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { MaterialSymbols_400Regular } from "@expo-google-fonts/material-symbols";
import { Fraunces_400Regular, Fraunces_600SemiBold } from "@expo-google-fonts/fraunces";
import { Geist_400Regular, Geist_500Medium } from "@expo-google-fonts/geist";
import { GeistMono_400Regular, GeistMono_500Medium } from "@expo-google-fonts/geist-mono";
import NetInfo from "@react-native-community/netinfo";
import { useFonts } from "expo-font";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { DarkTheme, Stack, ThemeProvider, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { AppState, Platform, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AppGate } from "@/components/app-gate";
import { Club } from "@/constants/club";
import { useSession } from "@/features/auth/client";
import { signOut } from "@/features/auth/flows";
import { clearPendingOtp } from "@/features/auth/otp-holder";
import { passwordStillPending, resolvePostAuthRoute } from "@/features/auth/session-gate";
import { isOffline } from "@/features/explore/offline-logic";
import { submitRequest } from "@/lib/api";
import { linkCanOpen, linkFromNotification } from "@/lib/deeplink-logic";
import { routeFromDeepLink } from "@/lib/deeplinks";
import { createFlushTimer } from "@/lib/flush-timer";
import { registerPushDevice } from "@/lib/push";
import { adoptQueue, flushQueue, listQueued, subscribeQueue } from "@/lib/queue";
import { onSessionRevoked } from "@/lib/session-events";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export const unstable_settings = {
  initialRouteName: "index",
};

const AUTH_ENTRY = new Set(["sign-in", "join", "reset-password"]);
/** Screens that own their own post-auth navigation (password, OTP, first-run prefs). */
const GATE_HOLD = new Set(["set-password", "verify-code", "onboarding"]);
/** Where a deep link waits: the entry screens and the gate's (lib/deeplink-logic.ts, `linkCanOpen`). */
const LINK_HOLD: ReadonlySet<string> = new Set([...AUTH_ENTRY, ...GATE_HOLD]);

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
  // One type system (DESIGN.md, ADR-IMPL-041): Fraunces, Geist, Geist Mono on every screen, Entry included.
  useFonts({
    Fraunces_400Regular,
    Fraunces_600SemiBold,
    Geist_400Regular,
    Geist_500Medium,
    GeistMono_400Regular,
    GeistMono_500Medium,
    MaterialSymbols_400Regular,
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

  const signedIn = Boolean(session) && !sessionPending;
  const memberId = session?.user.id ?? null;

  // Requests saved on the phone go out from anywhere — once signed in, each time the app comes back to the foreground,
  // when the phone comes back online, and when a request waiting with the app open is due (lib/flush-timer.ts) — not
  // only while Requests is open: the saved confirmation promises "Nothing more to do" (Figma 135:855). One flush at a
  // time (lib/queue.ts).
  useEffect(() => {
    if (!signedIn || !memberId) return;
    // The requests on the phone are this member's: another member's, left by a session that expired, are set aside for
    // them — never sent under this account (lib/queue.ts).
    adoptQueue(memberId);
    const submit = (body: Parameters<typeof submitRequest>[0], key: string) => submitRequest(body, key);
    const timer = createFlushTimer({
      pending: listQueued,
      online: async () => !isOffline(await NetInfo.fetch()),
      flush: () => flushQueue(submit),
    });
    // A fresh start: the timer's waits start over too.
    const flush = () => {
      timer.reset();
      void flushQueue(submit).catch(() => undefined);
    };
    flush();
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") flush();
    });
    let wasOffline: boolean | null = null;
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      const offline = isOffline(state);
      if (wasOffline === true && !offline) flush();
      wasOffline = offline;
    });
    timer.schedule();
    const unsubscribeQueue = subscribeQueue(timer.schedule);
    return () => {
      timer.stop();
      appState.remove();
      unsubscribeNet();
      unsubscribeQueue();
    };
  }, [signedIn, memberId]);

  // Deep links — bbcclub://requests/<id> | bbcclub://inbox | …, no secrets in the URL — from three places: the URL that
  // launched the app (taken once per process: the session refetches on every return to the foreground, and the launch
  // URL must not be pushed again each time), a URL while running, and a tapped push (its `deepLink`, wherever the
  // platform hands it over — lib/deeplink-logic.ts; the quote-ready push names its request). Each waits as
  // `pendingLink` until the member is signed in and past the entry and gate screens, so the gate's own `replace` never
  // lands on top of it. Expo Router leaves these links to us (+native-intent.tsx).
  const pendingLink = useRef<string | null>(null);
  const [linkTick, setLinkTick] = useState(0);
  useEffect(() => {
    const take = (url: string | null | undefined) => {
      if (!url) return;
      pendingLink.current = url;
      setLinkTick((n) => n + 1);
    };
    void Linking.getInitialURL()
      .then(take)
      .catch(() => undefined);
    const urls = Linking.addEventListener("url", (event) => take(event.url));
    // A tap can reach us twice at a cold start (the launch response, and the listener): once per notification.
    const seen = new Set<string>();
    const tapped = (response: Notifications.NotificationResponse | null) => {
      const link = linkFromNotification(response, Notifications.DEFAULT_ACTION_IDENTIFIER);
      if (!link || !response) return;
      const tap = response.notification.request.identifier;
      if (seen.has(tap)) return;
      seen.add(tap);
      try {
        // Answered once: the same tap is not taken again at the next launch.
        Notifications.clearLastNotificationResponse();
      } catch {
        // Not on this platform (web): nothing is kept between launches there.
      }
      take(link);
    };
    let taps: { remove: () => void } | null = null;
    try {
      tapped(Notifications.getLastNotificationResponse());
      taps = Notifications.addNotificationResponseReceivedListener(tapped);
    } catch {
      // Push is native only; on web there is no tap to answer.
    }
    return () => {
      urls.remove();
      taps?.remove();
    };
  }, []);

  useEffect(() => {
    const url = pendingLink.current;
    const leaf = typeof segments[0] === "string" ? segments[0] : "index";
    if (!url || !linkCanOpen(leaf, signedIn, LINK_HOLD)) return;
    pendingLink.current = null;
    const dest = routeFromDeepLink(url);
    if (dest) router.push(dest);
  }, [linkTick, signedIn, segments, router]);

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
