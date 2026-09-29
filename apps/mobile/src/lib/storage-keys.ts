import { createMMKV } from "react-native-mmkv";

/** App-level MMKV (onboarding flag, etc.). Separate from the request queue store. */
export const appStorage = createMMKV({ id: "bbc-app" });

/** Set once per device after onboarding (or skip). Cleared on sign-out / delete. */
export const ONBOARDED_KEY = "bbcclub.onboarded";

/** Path A: OTP created a session that still has no password. Cleared once the password is set, or on sign-out. */
export const PENDING_PASSWORD_KEY = "bbcclub.pendingPassword";

/** Set when the member turns notifications on or chooses Not now. Ask only while this is absent. */
export const PUSH_ASKED_AT_KEY = "bbcclub.pushAskedAt";
