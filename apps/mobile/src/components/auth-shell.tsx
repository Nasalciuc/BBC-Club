import { Image } from "expo-image";
import { Href, useRouter } from "expo-router";
import { PropsWithChildren, ReactNode } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardShown } from "@bbc/ui";

import cabinImage from "@/assets/images/cabin.webp";
import logoWelcome from "@/assets/images/logo-welcome.png";
import { ClubIcon } from "@/components/club-icon";
import { Club } from "@/constants/club";

type Logo = "none" | "left" | "center";

type Props = PropsWithChildren<{
  footer?: ReactNode;
  /** Where back goes when there is no history — or what it does, when leaving needs more than a navigation. */
  onBack?: Href | (() => void);
  logo?: Logo;
  heroPercent?: number;
  panelRadius?: number;
  testID?: string;
}>;

/** The back button's side, in the hero. */
const BACK_SIZE = 40;

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
  const keyboard = useKeyboardShown();
  const top = Math.max(insets.top, Club.space.md) + Club.space.xs;
  // With the keys up the photograph gives way to the fields (ADR-IMPL-047): it keeps only the back button and the logo,
  // above the panel's rounded edge, so the button stands on the keys and the field being typed in stays in view.
  const hero = keyboard
    ? { height: top + BACK_SIZE + Club.space.xl + Club.space.xs, minHeight: 0 }
    : { height: `${Math.round(heroPercent * 100)}%` as const };

  const goBack = () => {
    if (typeof onBack === "function") {
      onBack();
      return;
    }
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
      {/* `padding` on both platforms (ADR-IMPL-047): Android draws edge to edge, so the window no longer shrinks for the
          keyboard (`softwareKeyboardLayoutMode: resize` has nothing to resize) and, without it, the button stayed under
          the keys — the Maestro flows closed the keyboard first. A window that does shrink leaves no overlap to pad. */}
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <View style={[styles.hero, hero]}>
          <Image
            source={cabinImage}
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
              <Image source={logoWelcome} style={styles.logo} contentFit="contain" />
            </View>
          ) : null}

          {logo === "center" ? (
            <View style={[styles.logoCenter, { top }]}>
              <Image source={logoWelcome} style={styles.logo} contentFit="contain" />
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
          {/* On the keys, the navigation bar is under them: the padding above already counts it. */}
          {footer ? (
            <View
              style={[
                styles.footer,
                { paddingBottom: keyboard ? Club.space.md : Math.max(insets.bottom, Club.space.md) },
              ]}
            >
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
    width: BACK_SIZE,
    height: BACK_SIZE,
    borderRadius: BACK_SIZE / 2,
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
