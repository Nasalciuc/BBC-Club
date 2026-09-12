import { Image } from "expo-image";
import { Href, useRouter } from "expo-router";
import { PropsWithChildren, ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ClubIcon } from "@/components/club-icon";
import { Club } from "@/constants/club";

type Logo = "none" | "left" | "center";

type Props = PropsWithChildren<{
  footer?: ReactNode;
  onBack?: Href;
  logo?: Logo;
  heroPercent?: number;
  panelRadius?: number;
  testID?: string;
}>;

export function AuthShell({
  children,
  footer,
  onBack,
  logo = "none",
  heroPercent = 0.3,
  panelRadius = Club.radius.panel,
  testID = "authShell.back",
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const top = Math.max(insets.top, Club.space.md) + Club.space.xs;

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (onBack) {
      router.replace(onBack);
    }
  };

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.hero, { height: `${Math.round(heroPercent * 100)}%` }]}>
          <Image
            source={require("@/assets/images/cabin.webp")}
            style={[StyleSheet.absoluteFill, styles.heroImage]}
            contentFit="cover"
            blurRadius={12}
          />
          <View style={[StyleSheet.absoluteFill, styles.heroDim]} />

          {onBack ? (
            <Pressable
              testID={testID}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={goBack}
              hitSlop={Club.space.xs}
              style={[styles.back, { top }]}
            >
              <ClubIcon name="back" size={24} color={Club.colors.textOnDark} />
            </Pressable>
          ) : null}

          {logo === "left" ? (
            <View style={[styles.logoLeft, { top }]}>
              <Image
                source={require("@/assets/images/logo-welcome.png")}
                style={styles.logo}
                contentFit="contain"
              />
            </View>
          ) : null}

          {logo === "center" ? (
            <View style={[styles.logoCenter, { top }]}>
              <Image
                source={require("@/assets/images/logo-welcome.png")}
                style={styles.logo}
                contentFit="contain"
              />
            </View>
          ) : null}
        </View>

        <View
          style={[styles.panel, { borderTopLeftRadius: panelRadius, borderTopRightRadius: panelRadius }]}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
          >
            {children}
          </ScrollView>
          {footer ? (
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Club.space.md) }]}>
              {footer}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Club.colors.surfacePanel,
  },
  flex: {
    flex: 1,
  },
  hero: {
    minHeight: 160,
    overflow: "hidden",
  },
  heroImage: {
    opacity: 0.6,
    transform: [{ scale: 1.05 }],
  },
  heroDim: {
    backgroundColor: Club.colors.heroDim,
  },
  back: {
    position: "absolute",
    left: Club.space.gutter,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  logoLeft: {
    position: "absolute",
    left: Club.space.gutter,
  },
  logoCenter: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    pointerEvents: "none",
  },
  logo: {
    height: 32,
    width: 148,
    opacity: 0.9,
  },
  panel: {
    flex: 1,
    marginTop: -Club.space.xl,
    backgroundColor: Club.colors.surfacePanel,
    zIndex: 2,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Club.space.gutter,
    paddingTop: Club.space.xl,
    paddingBottom: Club.space.xl,
  },
  footer: {
    paddingHorizontal: Club.space.gutter,
    paddingTop: Club.space.xs,
    backgroundColor: Club.colors.surfacePanel,
    gap: Club.space.lg,
  },
});
