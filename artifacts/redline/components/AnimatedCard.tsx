import React, { useEffect, useRef } from 'react';
import { Animated, ViewStyle } from 'react-native';

interface AnimatedCardProps {
  index: number;
  children: React.ReactNode;
  style?: ViewStyle;
  delay?: number;
  duration?: number;
  slideDistance?: number;
}

const AnimatedCard = React.memo(function AnimatedCard({
  index,
  children,
  style,
  delay = 60,
  duration = 350,
  slideDistance = 24,
}: AnimatedCardProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(slideDistance)).current;
  // The entrance animation must run exactly ONCE, on mount. Re-running it on
  // re-render (e.g. when `index` changes as the list reorders, or when one of the
  // screen's async queries resolves) would reset the card back to opacity:0 and
  // restart the staggered delay — and an Animated.View at opacity:0 still occupies
  // its full layout height, so a card caught mid-animation shows up as a blank gap
  // in the list. Guarding with a ref guarantees an already-shown card never hides.
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;

    const staggerDelay = index * delay;
    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay: staggerDelay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        delay: staggerDelay,
        useNativeDriver: true,
      }),
    ]);

    animation.start(({ finished }) => {
      // If the animation is interrupted for any reason, snap to the visible end
      // state so the card can never be left invisible.
      if (!finished) {
        opacity.setValue(1);
        translateY.setValue(0);
      }
    });

    return () => {
      animation.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
});

export default AnimatedCard;
