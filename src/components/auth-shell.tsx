import { Image } from "expo-image";
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
  onBack?: () => void;
  logo?: Logo;
  heroPercent?: number;
  panelRadius?: number;
}>;

export function AuthShell({
  children,
  footer,
  onBack,
  logo = "none",
  heroPercent = 0.3,
  panelRadius = Club.radius.panel,
}: Props) {
  const insets = useSafeAreaInsets();
  const top = Math.max(insets.top, 16) + 8;

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.hero, { height: `${Math.round(heroPercent * 100)}%` }]}>
          <Image
            source={require("@/assets/images/signin-cabin.png")}
            style={[StyleSheet.absoluteFill, styles.heroImage]}
            contentFit="cover"
            blurRadius={12}
          />
          <View style={styles.heroDim} />

          {onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={onBack}
              hitSlop={8}
              style={[styles.back, { top }]}
            >
              <ClubIcon name="back" size={24} color={Club.colors.white} />
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

        <View style={[styles.panel, { borderTopLeftRadius: panelRadius, borderTopRightRadius: panelRadius }]}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
          >
            {children}
          </ScrollView>
          {footer ? (
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>{footer}</View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Club.colors.navyDeep,
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(9,20,38,0.4)",
  },
  back: {
    position: "absolute",
    left: Club.space.margin,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  logoLeft: {
    position: "absolute",
    left: Club.space.margin,
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
    marginTop: -32,
    backgroundColor: Club.colors.navy,
    zIndex: 2,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Club.space.margin,
    paddingTop: Club.space.stackLg,
    paddingBottom: Club.space.stackLg,
  },
  footer: {
    paddingHorizontal: Club.space.margin,
    paddingTop: 8,
    backgroundColor: Club.colors.navy,
    gap: Club.space.stackMd,
  },
});
