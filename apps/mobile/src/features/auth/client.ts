import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import { emailOTPClient } from "better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";
import { env } from "@/lib/env";
// Roles are server-side only (ADR-IMPL-006); the app never needs the admin client.

export const authClient = createAuthClient({
  baseURL: env.EXPO_PUBLIC_API_URL,
  plugins: [expoClient({ scheme: "bbcclub", storagePrefix: "bbcclub", storage: SecureStore }), emailOTPClient()],
});
export const { useSession } = authClient;

/** For our own RPC calls (hc<AppType>): forward the session cookie the Expo plugin keeps in SecureStore. */
export function authHeaders(): Record<string, string> {
  const cookie = authClient.getCookie();
  return cookie ? { Cookie: cookie } : {};
}

const COOKIE_WAIT_MS = 1000;
const COOKIE_POLL_MS = 50;

/**
 * Expo plugin writes the session cookie to SecureStore asynchronously after sign-in.
 * Poll briefly so /v1/* calls do not race an empty getCookie() → 401 → bounce to sign-in.
 */
export async function waitForSessionCookie(): Promise<boolean> {
  const deadline = Date.now() + COOKIE_WAIT_MS;
  while (Date.now() < deadline) {
    if (authClient.getCookie()) return true;
    await authClient.getSession().catch(() => undefined);
    if (authClient.getCookie()) return true;
    await new Promise<void>((resolve) => setTimeout(resolve, COOKIE_POLL_MS));
  }
  return Boolean(authClient.getCookie());
}
