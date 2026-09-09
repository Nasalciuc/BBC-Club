import { PropsWithChildren, useEffect, useRef } from "react";
import { Animated, Easing, Platform } from "react-native";

type Props = PropsWithChildren<{
  delay?: number;
  fade?: boolean;
}>;

export function AnimatedEntrance({ children, delay = 0, fade = false }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(fade ? 0 : 12)).current;

  useEffect(() => {
    const ease = Easing.bezier(0.16, 1, 0.3, 1);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: fade ? 1200 : 2500,
        delay,
        easing: ease,
        useNativeDriver: Platform.OS !== "web",
      }),
      fade
        ? Animated.delay(0)
        : Animated.timing(translateY, {
            toValue: 0,
            duration: 2500,
            delay,
            easing: ease,
            useNativeDriver: Platform.OS !== "web",
          }),
    ]).start();
  }, [delay, fade, opacity, translateY]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>
  );
}
