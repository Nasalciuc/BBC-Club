import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";

import { registerDevice } from "@/lib/api";

const DEVICE_ID_KEY = "bbcclub.deviceId";

async function stableDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = `bbc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  return id;
}

/**
 * Request notification permission and POST /v1/devices when permitted.
 * No-op on web / simulators without push; failures are swallowed (non-blocking).
 */
export async function registerPushDevice(): Promise<void> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;
  if (!Device.isDevice) return;

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== "granted") {
    const asked = await Notifications.requestPermissionsAsync();
    status = asked.status;
  }
  if (status !== "granted") return;

  const deviceId = await stableDeviceId();
  const native = await Notifications.getDevicePushTokenAsync();
  const nativeToken = typeof native.data === "string" ? native.data : String(native.data);

  let expoToken: string | undefined;
  try {
    const projectId =
      Constants.easConfig?.projectId ??
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    if (projectId) {
      const expo = await Notifications.getExpoPushTokenAsync({ projectId });
      expoToken = expo.data;
    }
  } catch {
    // Expo token optional — native token is enough for DeviceBody.
  }

  const result = await registerDevice({
    deviceId,
    platform: Platform.OS,
    nativeToken,
    ...(expoToken ? { expoToken } : {}),
    appVersion: Constants.expoConfig?.version,
  });
  if (!result.ok) {
    // Non-fatal: member can still use the app without push.
  }
}
