import { PropsWithChildren, useEffect } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

type Props = PropsWithChildren<{
  delay?: number;
  fade?: boolean;
}>;

export function AnimatedEntrance({ children, delay = 0, fade = false }: Props) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(fade || reduceMotion ? 0 : 12);

  useEffect(() => {
    const ease = Easing.bezier(0.16, 1, 0.3, 1);
    opacity.value = withDelay(delay, withTiming(1, { duration: 900, easing: ease }));
    if (!fade && !reduceMotion) {
      translateY.value = withDelay(delay, withTiming(0, { duration: 900, easing: ease }));
    }
  }, [delay, fade, opacity, reduceMotion, translateY]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}
