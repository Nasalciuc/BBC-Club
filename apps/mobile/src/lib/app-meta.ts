import { Platform } from "react-native";
import * as Application from "expo-application";
import { mapAppPlatform } from "./app-platform";

export { mapAppPlatform };

export function appPlatform(): "ios" | "android" {
  return mapAppPlatform(Platform.OS);
}

export function appVersion(): string {
  return Application.nativeApplicationVersion ?? "0.0.0";
}
