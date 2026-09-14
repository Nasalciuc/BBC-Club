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
