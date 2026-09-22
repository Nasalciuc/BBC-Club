import { createMMKV } from "react-native-mmkv";

/** App-level MMKV (onboarding flag, etc.). Separate from the request queue store. */
export const appStorage = createMMKV({ id: "bbc-app" });

/** Set once per device after onboarding (or skip). Cleared on sign-out / delete. */
export const ONBOARDED_KEY = "bbcclub.onboarded";
