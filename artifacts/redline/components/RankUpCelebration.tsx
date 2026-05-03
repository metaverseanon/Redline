import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Trophy } from 'lucide-react-native';
import { ThemeColors } from '@/constants/colors';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

interface ConfettiPieceProps {
  delay: number;
  color: string;
  startX: number;
  emoji?: string;
}

function ConfettiPiece({ delay, color, startX, emoji }: ConfettiPieceProps) {
  const ty = useSharedValue(-30);
  const opacity = useSharedValue(0);
  const rot = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 200 }));
    ty.value = withDelay(
      delay,
      withTiming(SCREEN_H * 0.7, { duration: 1800, easing: Easing.out(Easing.quad) }),
    );
    rot.value = withDelay(
      delay,
      withTiming(360 * 2, { duration: 1800, easing: Easing.linear }),
    );
    const fadeTimer = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 400 });
    }, delay + 1400);
    return () => clearTimeout(fadeTimer);
  }, [delay, opacity, ty, rot]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: ty.value },
      { rotate: `${rot.value}deg` },
    ],
    opacity: opacity.value,
  }));

  if (emoji) {
    return (
      <Animated.Text
        style={[
          { position: 'absolute', left: startX, top: 0, fontSize: 22 },
          style,
        ]}
      >
        {emoji}
      </Animated.Text>
    );
  }

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: startX,
          top: 0,
          width: 8,
          height: 14,
          borderRadius: 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

interface RankUpCelebrationProps {
  visible: boolean;
  spotsClimbed: number;
  newRank: number;
  colors: ThemeColors;
  onDismiss: () => void;
}

const CONFETTI_COLORS = ['#FFD700', '#FF4444', '#44FF88', '#4488FF', '#FF44FF', '#FFFFFF'];

export default function RankUpCelebration({
  visible,
  spotsClimbed,
  newRank,
  colors,
  onDismiss,
}: RankUpCelebrationProps) {
  const cardOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.7);

  const handleDismiss = useMemo(() => onDismiss, [onDismiss]);

  useEffect(() => {
    if (!visible) return;
    cardOpacity.value = withTiming(1, { duration: 250 });
    cardScale.value = withSequence(
      withTiming(1.05, { duration: 250, easing: Easing.out(Easing.back(1.5)) }),
      withTiming(1, { duration: 150 }),
    );

    const autoDismiss = setTimeout(() => {
      cardOpacity.value = withTiming(0, { duration: 350 }, (done) => {
        if (done) runOnJS(handleDismiss)();
      });
    }, 2800);
    return () => clearTimeout(autoDismiss);
  }, [visible, cardOpacity, cardScale, handleDismiss]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

  const pieces = useMemo(() => {
    const arr: ConfettiPieceProps[] = [];
    for (let i = 0; i < 28; i++) {
      arr.push({
        delay: Math.random() * 350,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        startX: Math.random() * SCREEN_W,
      });
    }
    arr.push({ delay: 100, color: '', startX: SCREEN_W * 0.2, emoji: '🎉' });
    arr.push({ delay: 200, color: '', startX: SCREEN_W * 0.5, emoji: '🏁' });
    arr.push({ delay: 300, color: '', startX: SCREEN_W * 0.8, emoji: '🎉' });
    return arr;
  }, []);

  if (!visible) return null;

  return (
    <Pressable
      style={styles.overlay}
      onPress={() => {
        cardOpacity.value = withTiming(0, { duration: 200 }, (done) => {
          if (done) runOnJS(onDismiss)();
        });
      }}
    >
      {pieces.map((p, i) => (
        <ConfettiPiece key={i} {...p} />
      ))}
      <Animated.View
        style={[
          styles.card,
          { backgroundColor: colors.cardBackground, borderColor: colors.accent },
          cardStyle,
        ]}
      >
        <View style={[styles.iconCircle, { backgroundColor: colors.accent }]}>
          <Trophy size={32} color="#000" fill="#000" />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>RANK UP!</Text>
        <Text style={[styles.subtitle, { color: colors.textLight }]}>
          You climbed {spotsClimbed} spot{spotsClimbed === 1 ? '' : 's'}
        </Text>
        <Text style={[styles.bigRank, { color: colors.accent }]}>#{newRank}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  card: {
    paddingHorizontal: 36,
    paddingVertical: 28,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    minWidth: 260,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Orbitron_700Bold',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: 'Orbitron_400Regular',
    marginTop: 6,
  },
  bigRank: {
    fontSize: 44,
    fontFamily: 'Orbitron_700Bold',
    marginTop: 10,
    letterSpacing: 1,
  },
});
