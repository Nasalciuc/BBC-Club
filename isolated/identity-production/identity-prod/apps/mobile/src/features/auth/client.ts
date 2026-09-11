import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import { emailOTPClient, adminClient } from "better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";
import { ac, roles } from "@bbc/identity/access";   // shared access control (type-safe permissions)

export const authClient = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_API_URL!,      // validated at app start in lib/env.ts
  plugins: [
    expoClient({ scheme: "bbcclub", storagePrefix: "bbcclub", storage: SecureStore }),
    emailOTPClient(),
    adminClient({ ac, roles }),
  ],
});
export const { useSession } = authClient;

/** For our own RPC calls (hc<AppType>): forward the session cookie the Expo plugin keeps in SecureStore. */
export function authHeaders(): Record<string, string> {
  const cookie = authClient.getCookie();
  return cookie ? { Cookie: cookie } : {};
}
