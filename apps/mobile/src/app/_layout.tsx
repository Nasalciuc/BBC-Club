import { MaterialSymbols_400Regular } from "@expo-google-fonts/material-symbols";
import { Inter_400Regular, Inter_500Medium } from "@expo-google-fonts/inter";
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono";
import { SourceSerif4_400Regular } from "@expo-google-fonts/source-serif-4";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { Club } from "@/constants/club";
import { clearPendingOtp } from "@/features/auth/otp-holder";

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: "index",
};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    SourceSerif4_400Regular,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    MaterialSymbols_400Regular,
  });

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  useEffect(() => () => clearPendingOtp(), []);

  if (!loaded && !error) {
    return null;
  }

  return (
    <View style={styles.shell}>
      <GestureHandlerRootView style={styles.phone}>
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
          <Stack.Screen name="home" />
        </Stack>
      </GestureHandlerRootView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: Club.colors.surfaceMuted,
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
