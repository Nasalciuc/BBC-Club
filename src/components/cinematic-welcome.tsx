import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnimatedEntrance } from "@/components/animated-entrance";
import { ClubButton } from "@/components/club-button";
import { Club } from "@/constants/club";

export function CinematicWelcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(scale, {
      toValue: 1.1,
      duration: 20000,
      easing: Easing.out(Easing.ease),
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [scale]);

  return (
    <View style={styles.root}>
      <View style={styles.background}>
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale }] }]}>
          <Image
            source={require("@/assets/images/welcome-cabin.png")}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={0}
          />
        </Animated.View>
        <LinearGradient
          colors={["transparent", "rgba(30,41,59,0.8)", Club.colors.navy]}
          locations={[0, 0.45, 1]}
          style={styles.scrim}
        />
      </View>

      <View
        style={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 24) + 16,
            paddingBottom: Math.max(insets.bottom, 24) + 8,
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
              <ClubButton label="Sign in" arrow onPress={() => router.push("/sign-in")} />
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
    ...StyleSheet.absoluteFillObject,
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
    paddingHorizontal: Club.space.margin,
    maxWidth: 448,
    width: "100%",
    alignSelf: "center",
  },
  logo: {
    height: 32,
    width: 148,
  },
  bottom: {
    gap: Club.space.stackMd,
    paddingBottom: 32,
  },
  copy: {
    gap: Club.space.stackSm,
  },
  label: {
    ...Club.type.label,
    color: "rgba(255,255,255,0.6)",
    textTransform: "uppercase",
  },
  headline: {
    ...Club.type.headline,
    color: Club.colors.white,
  },
  subline: {
    ...Club.type.body,
    color: "rgba(255,255,255,0.8)",
    maxWidth: 280,
  },
  actions: {
    marginTop: Club.space.stackMd,
    gap: Club.space.stackSm,
  },
  footer: {
    ...Club.type.label,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    textTransform: "uppercase",
    marginTop: 8,
  },
});
