import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, Animated, Platform, TouchableOpacity, Dimensions } from 'react-native';
import { Flame, X } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useAchievements } from '@/providers/AchievementProvider';

const SHOWN_KEY = 'streak_popup_last_shown';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isStreakActiveToday(lastDriveDate: string): boolean {
  if (!lastDriveDate) return false;
  const now = new Date();
  const today = todayKey();
  const y = new Date(now.getTime() - 86400000);
  const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  return lastDriveDate === today || lastDriveDate === yesterday;
}

export default function StreakPopup() {
  const { streak } = useAchievements();
  const [visible, setVisible] = useState<boolean>(false);
  const checkedRef = useRef<boolean>(false);

  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.7)).current;
  const flamePulse = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (checkedRef.current) return;
    if (!streak) return;

    checkedRef.current = true;

    (async () => {
      try {
        const count = streak.currentStreak;
        if (count <= 0) return;
        if (!isStreakActiveToday(streak.lastDriveDate)) return;

        const lastShown = await AsyncStorage.getItem(SHOWN_KEY);
        const today = todayKey();
        if (lastShown === today) return;

        await AsyncStorage.setItem(SHOWN_KEY, today);
        setVisible(true);
      } catch (e) {
        console.warn('[STREAK_POPUP] check failed:', e);
      }
    })();
  }, [streak]);

  useEffect(() => {
    if (!visible) return;

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }

    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: Platform.OS !== 'web' }),
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(flamePulse, { toValue: 1.12, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(flamePulse, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1200, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(glow, { toValue: 0.3, duration: 1200, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    ).start();

    const t = setTimeout(() => {
      handleClose();
    }, 3500);

    return () => clearTimeout(t);
  }, [visible]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(scale, { toValue: 0.85, duration: 200, useNativeDriver: Platform.OS !== 'web' }),
    ]).start(() => {
      setVisible(false);
    });
  };

  if (!visible) return null;

  const count = streak.currentStreak;
  const message = count === 1
    ? "You started a streak!"
    : count < 7
      ? "Keep the fire burning"
      : count < 30
        ? "You're on fire!"
        : "Legendary streak!";

  return (
    <Animated.View
      testID="streak-popup-backdrop"
      pointerEvents="box-none"
      style={[styles.backdrop, { opacity }]}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPress={handleClose}
        style={styles.backdropTouch}
      >
        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
          <TouchableOpacity
            testID="streak-popup-close"
            style={styles.closeBtn}
            onPress={handleClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <X size={18} color="#fff" />
          </TouchableOpacity>

          <View style={styles.flameWrap}>
            <Animated.View
              style={[
                styles.glow,
                {
                  opacity: glow,
                  transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.25] }) }],
                },
              ]}
            />
            <Animated.View style={{ transform: [{ scale: flamePulse }] }}>
              <Flame size={72} color="#FF6B00" fill="#FF6B00" strokeWidth={1.5} />
            </Animated.View>
          </View>

          <View style={styles.countRow}>
            <Text style={styles.count}>{count}</Text>
            <Text style={styles.dayLabel}>day{count === 1 ? '' : 's'}</Text>
          </View>

          <Text style={styles.title}>Driving Streak</Text>
          <Text style={styles.subtitle}>{message}</Text>

          <View style={styles.divider} />
          <Text style={styles.hint}>Drive tomorrow to keep it alive</Text>
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    zIndex: 9999,
    elevation: 9999,
  },
  backdropTouch: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: Math.min(width - 48, 340),
    backgroundColor: '#111',
    borderRadius: 28,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,107,0,0.3)',
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  flameWrap: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  glow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,107,0,0.25)',
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 4,
  },
  count: {
    fontSize: 64,
    fontWeight: '800' as const,
    color: '#FF6B00',
    letterSpacing: -2,
  },
  dayLabel: {
    fontSize: 20,
    fontWeight: '600' as const,
    color: '#fff',
    opacity: 0.9,
  },
  title: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#fff',
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 15,
    color: '#FF9F43',
    marginTop: 8,
    fontWeight: '600' as const,
    textAlign: 'center' as const,
  },
  divider: {
    width: 40,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginTop: 20,
    marginBottom: 14,
    borderRadius: 1,
  },
  hint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center' as const,
  },
});
