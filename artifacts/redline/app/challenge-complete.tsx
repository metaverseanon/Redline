import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Trophy, Star, ChevronRight, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSettings } from '@/providers/SettingsProvider';
import { useAchievements } from '@/providers/AchievementProvider';
import { ACHIEVEMENTS } from '@/constants/achievements';
import { BADGE_TIERS } from '@/constants/badges';
import { ThemeColors } from '@/constants/colors';
import { AchievementCategory } from '@/types/achievement';

const CATEGORY_COLORS: Record<AchievementCategory, string> = {
  speed: '#FF3B30',
  distance: '#007AFF',
  trips: '#FF9500',
  streak: '#FF6B00',
  social: '#AF52DE',
  performance: '#30D158',
};

export default function ChallengeCompleteScreen() {
  const { achievementId } = useLocalSearchParams<{ achievementId: string }>();
  const { colors } = useSettings();
  const { unlockedCount, totalCount, clearPendingCongrats } = useAchievements();

  const achievement = useMemo(() => ACHIEVEMENTS.find(a => a.id === achievementId), [achievementId]);
  const catColor = achievement ? CATEGORY_COLORS[achievement.category] : colors.accent;

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const trophyRotate = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const badgeScale = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  const progressPercent = totalCount > 0 ? (unlockedCount / totalCount) * 100 : 0;

  const newBadgeEarned = useMemo(() => {
    if (unlockedCount <= 0 || totalCount <= 0) return null;
    const prevRatio = (unlockedCount - 1) / totalCount;
    const currRatio = unlockedCount / totalCount;
    for (const tier of BADGE_TIERS) {
      if (prevRatio < tier.threshold && currRatio >= tier.threshold) {
        return tier;
      }
    }
    return null;
  }, [unlockedCount, totalCount]);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }

    Animated.sequence([
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, friction: 4, tension: 60, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.sequence([
          Animated.timing(trophyRotate, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.timing(trophyRotate, { toValue: -1, duration: 400, useNativeDriver: true }),
          Animated.timing(trophyRotate, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]),
        Animated.timing(progressAnim, { toValue: progressPercent, duration: 800, useNativeDriver: false }),
      ]),
    ]).start();

    if (newBadgeEarned) {
      setTimeout(() => {
        Animated.spring(badgeScale, { toValue: 1, friction: 3, tension: 50, useNativeDriver: true }).start();
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
        }
      }, 1200);
    }

    Animated.loop(
      Animated.timing(shimmerAnim, { toValue: 1, duration: 2000, useNativeDriver: true })
    ).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = () => {
    clearPendingCongrats();
    router.back();
  };

  const handleViewAll = () => {
    clearPendingCongrats();
    router.back();
    setTimeout(() => router.push('/achievements'), 200);
  };

  const styles = useMemo(() => createStyles(colors, catColor), [colors, catColor]);

  const trophyRotation = trophyRotate.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-15deg', '0deg', '15deg'],
  });

  if (!achievement) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
        <View style={styles.container}>
          <Text style={styles.errorText}>Achievement not found</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
      <View style={styles.container}>
        <View style={styles.particleField}>
          {[...Array(12)].map((_, i) => (
            <Animated.View
              key={i}
              style={[
                styles.particle,
                {
                  left: `${10 + (i * 7) % 80}%` as any,
                  top: `${5 + (i * 11) % 60}%` as any,
                  opacity: shimmerAnim.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0.1, i % 2 === 0 ? 0.6 : 0.3, 0.1],
                  }),
                  transform: [{
                    scale: shimmerAnim.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [0.5, 1.2, 0.5],
                    }),
                  }],
                  backgroundColor: i % 3 === 0 ? catColor : (i % 3 === 1 ? '#FFD700' : colors.accent),
                },
              ]}
            />
          ))}
        </View>

        <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
          <View style={styles.labelPill}>
            <Sparkles size={14} color={catColor} />
            <Text style={styles.labelText}>CHALLENGE COMPLETE</Text>
          </View>

          <Animated.View style={[styles.trophyCircle, { transform: [{ rotate: trophyRotation }] }]}>
            <View style={[styles.trophyInner, { backgroundColor: catColor + '20', borderColor: catColor + '40' }]}>
              <Trophy size={48} color={catColor} />
            </View>
          </Animated.View>

          <Text style={styles.title}>{achievement.title}</Text>
          <Text style={styles.description}>{achievement.description}</Text>

          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Overall Progress</Text>
              <Text style={[styles.progressValue, { color: catColor }]}>{unlockedCount}/{totalCount}</Text>
            </View>
            <View style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: catColor,
                    width: progressAnim.interpolate({
                      inputRange: [0, 100],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>
            <Text style={styles.progressPercent}>{Math.round(progressPercent)}% complete</Text>
          </View>

          {newBadgeEarned && (
            <Animated.View style={[styles.badgeSection, { transform: [{ scale: badgeScale }] }]}>
              <View style={[styles.badgeCard, { backgroundColor: newBadgeEarned.bgColor, borderColor: newBadgeEarned.borderColor }]}>
                <View style={[styles.badgeIconCircle, { backgroundColor: newBadgeEarned.color + '30' }]}>
                  <Star size={24} color={newBadgeEarned.color} fill={newBadgeEarned.color} />
                </View>
                <View style={styles.badgeInfo}>
                  <Text style={styles.badgeNewLabel}>NEW BADGE EARNED!</Text>
                  <Text style={[styles.badgeName, { color: newBadgeEarned.color }]}>{newBadgeEarned.name} Shield</Text>
                </View>
              </View>
            </Animated.View>
          )}

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: catColor }]} onPress={handleClose} activeOpacity={0.8}>
              <Text style={styles.primaryBtnText}>Awesome!</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={handleViewAll} activeOpacity={0.7}>
              <Text style={[styles.secondaryBtnText, { color: catColor }]}>View All Achievements</Text>
              <ChevronRight size={16} color={catColor} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </>
  );
}

function createStyles(colors: ThemeColors, catColor: string) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
    },
    errorText: {
      color: colors.textLight,
      fontSize: 16,
      fontFamily: 'Orbitron_500Medium',
    },
    closeBtn: {
      marginTop: 20,
      paddingHorizontal: 24,
      paddingVertical: 12,
      backgroundColor: colors.accent,
      borderRadius: 12,
    },
    closeBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontFamily: 'Orbitron_600SemiBold',
    },
    particleField: {
      ...StyleSheet.absoluteFillObject,
    },
    particle: {
      position: 'absolute' as const,
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    content: {
      alignItems: 'center',
      paddingHorizontal: 32,
      width: '100%',
    },
    labelPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: catColor + '15',
      borderWidth: 1,
      borderColor: catColor + '30',
      marginBottom: 28,
    },
    labelText: {
      fontSize: 11,
      fontFamily: 'Orbitron_700Bold',
      color: catColor,
      letterSpacing: 2,
    },
    trophyCircle: {
      marginBottom: 24,
    },
    trophyInner: {
      width: 100,
      height: 100,
      borderRadius: 50,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
    },
    title: {
      fontSize: 24,
      fontFamily: 'Orbitron_700Bold',
      color: colors.text,
      textAlign: 'center',
      marginBottom: 8,
    },
    description: {
      fontSize: 14,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
      textAlign: 'center',
      marginBottom: 32,
      lineHeight: 22,
    },
    progressSection: {
      width: '100%',
      marginBottom: 24,
    },
    progressHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    progressLabel: {
      fontSize: 12,
      fontFamily: 'Orbitron_500Medium',
      color: colors.textLight,
    },
    progressValue: {
      fontSize: 14,
      fontFamily: 'Orbitron_700Bold',
    },
    progressTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.cardLight,
      overflow: 'hidden',
    },
    progressFill: {
      height: 8,
      borderRadius: 4,
    },
    progressPercent: {
      fontSize: 11,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
      marginTop: 6,
      textAlign: 'right',
    },
    badgeSection: {
      width: '100%',
      marginBottom: 24,
    },
    badgeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderRadius: 16,
      borderWidth: 1.5,
      gap: 14,
    },
    badgeIconCircle: {
      width: 50,
      height: 50,
      borderRadius: 25,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeInfo: {
      flex: 1,
    },
    badgeNewLabel: {
      fontSize: 9,
      fontFamily: 'Orbitron_700Bold',
      color: '#FFD700',
      letterSpacing: 1.5,
      marginBottom: 4,
    },
    badgeName: {
      fontSize: 18,
      fontFamily: 'Orbitron_700Bold',
    },
    actions: {
      width: '100%',
      gap: 12,
    },
    primaryBtn: {
      paddingVertical: 16,
      borderRadius: 14,
      alignItems: 'center',
    },
    primaryBtnText: {
      fontSize: 16,
      fontFamily: 'Orbitron_700Bold',
      color: '#FFFFFF',
      letterSpacing: 1,
    },
    secondaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      gap: 4,
    },
    secondaryBtnText: {
      fontSize: 13,
      fontFamily: 'Orbitron_600SemiBold',
    },
  });
}
