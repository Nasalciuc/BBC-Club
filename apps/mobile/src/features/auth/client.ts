import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import { emailOTPClient } from "better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";
// Roles are server-side only (ADR-IMPL-006); the app never needs the admin client.

export const authClient = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_API_URL!, // validated at app start in lib/env.ts
  plugins: [
    expoClient({ scheme: "bbcclub", storagePrefix: "bbcclub", storage: SecureStore }),
    emailOTPClient(),
  ],
});
export const { useSession } = authClient;

/** For our own RPC calls (hc<AppType>): forward the session cookie the Expo plugin keeps in SecureStore. */
export function authHeaders(): Record<string, string> {
  const cookie = authClient.getCookie();
  return cookie ? { Cookie: cookie } : {};
}
