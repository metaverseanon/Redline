import React, { useEffect, useMemo } from 'react';
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
  const opacity = useMemo(() => new Animated.Value(0), []);
  const translateY = useMemo(() => new Animated.Value(slideDistance), [slideDistance]);

  useEffect(() => {
    opacity.setValue(0);
    translateY.setValue(slideDistance);
    const staggerDelay = index * delay;

    Animated.parallel([
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
    ]).start();
  }, [index, delay, duration, slideDistance, opacity, translateY]);

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
