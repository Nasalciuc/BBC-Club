import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnimatedEntrance } from "@/components/animated-entrance";
import { ClubButton } from "@/components/club-button";
import { Club } from "@/constants/club";

export function CinematicWelcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.set(
      withTiming(1.1, {
        duration: 20000,
        easing: Easing.out(Easing.ease),
      }),
    );
  }, [scale]);

  const kenBurns = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));

  return (
    <View style={styles.root}>
      <View style={styles.background}>
        <Animated.View style={[StyleSheet.absoluteFill, kenBurns]}>
          <Image
            source={require("@/assets/images/cabin.webp")}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={0}
          />
        </Animated.View>
        <LinearGradient colors={[...Club.colors.scrim]} locations={[0, 0.45, 1]} style={styles.scrim} />
      </View>

      <View
        style={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, Club.space.lg) + Club.space.md,
            paddingBottom: Math.max(insets.bottom, Club.space.lg) + Club.space.xs,
          },
        ]}
      >
        <AnimatedEntrance fade delay={400}>
          <Image
            source={require("@/assets/images/logo-welcome.png")}
            style={styles.logo}
            contentFit="contain"
          />
        </AnimatedEntrance>

        <View style={styles.bottom}>
          <View style={styles.copy}>
            <AnimatedEntrance delay={800}>
              <Text style={styles.label}>Private Travel Club</Text>
            </AnimatedEntrance>
            <View>
              <AnimatedEntrance delay={1000}>
                <Text style={styles.headline}>Eight hours in a lie-flat suite.</Text>
              </AnimatedEntrance>
              <AnimatedEntrance delay={1200}>
                <Text style={styles.headline}>Land rested.</Text>
              </AnimatedEntrance>
            </View>
            <AnimatedEntrance delay={1400}>
              <Text style={styles.subline}>Thoughtful travel, arranged around you.</Text>
            </AnimatedEntrance>
          </View>

          <AnimatedEntrance delay={1600}>
            <View style={styles.actions}>
              <ClubButton
                testID="welcome.signIn"
                label="Sign in"
                arrow
                onPress={() => router.push("/sign-in")}
              />
              <Text style={styles.footer}>For BuyBusinessClass Clients</Text>
            </View>
          </AnimatedEntrance>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Club.colors.black,
    overflow: "hidden",
  },
  background: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Club.colors.black,
  },
  scrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "45%",
  },
  content: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: Club.space.gutter,
    maxWidth: 448,
    width: "100%",
    alignSelf: "center",
  },
  logo: {
    height: 32,
    width: 148,
  },
  bottom: {
    gap: Club.space.lg,
    paddingBottom: Club.space.xl,
  },
  copy: {
    gap: Club.space.sm,
  },
  label: {
    ...Club.type.labelMono,
    color: Club.colors.textOnDarkMuted,
    textTransform: "uppercase",
  },
  headline: {
    ...Club.type.headline,
    color: Club.colors.textOnDark,
  },
  subline: {
    ...Club.type.body,
    color: Club.colors.textOnDarkMuted,
    maxWidth: 280,
  },
  actions: {
    marginTop: Club.space.lg,
    gap: Club.space.sm,
  },
  footer: {
    ...Club.type.labelMono,
    color: Club.colors.textOnDarkMuted,
    textAlign: "center",
    textTransform: "uppercase",
    marginTop: Club.space.xs,
  },
});
