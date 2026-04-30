import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View, Animated, Platform } from 'react-native';
import { Flame, Target, Check } from 'lucide-react-native';
import { useAchievements } from '@/providers/AchievementProvider';
import { useDailyMission } from '@/providers/DailyMissionProvider';
import { useSettings } from '@/providers/SettingsProvider';
import { ThemeColors } from '@/constants/colors';

function isStreakActiveToday(lastDriveDate: string): boolean {
  if (!lastDriveDate) return false;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const yesterdayD = new Date(now.getTime() - 86400000);
  const yesterday = `${yesterdayD.getFullYear()}-${String(yesterdayD.getMonth() + 1).padStart(2, '0')}-${String(yesterdayD.getDate()).padStart(2, '0')}`;
  return lastDriveDate === today || lastDriveDate === yesterday;
}

export default function DailyCard() {
  const { streak } = useAchievements();
  const { mission, completed, progress, progressPercent } = useDailyMission();
  const { colors, convertSpeed, convertDistance, getSpeedLabel, getDistanceLabel } = useSettings();

  const styles = useMemo(() => createStyles(colors), [colors]);

  const widthAnim = useRef(new Animated.Value(0)).current;
  const flameScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: progressPercent,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [progressPercent, widthAnim]);

  useEffect(() => {
    if (streak.currentStreak > 0 && isStreakActiveToday(streak.lastDriveDate)) {
      Animated.sequence([
        Animated.timing(flameScale, { toValue: 1.15, duration: 400, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(flameScale, { toValue: 1, duration: 400, useNativeDriver: Platform.OS !== 'web' }),
      ]).start();
    }
  }, [streak.currentStreak, streak.lastDriveDate, flameScale]);

  const streakAlive = isStreakActiveToday(streak.lastDriveDate);
  const streakCount = streak.currentStreak;
  const drovenToday = streak.lastDriveDate === (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const progressLabel = useMemo(() => {
    switch (mission.metric) {
      case 'anyDrive':
        return drovenToday ? 'Drive logged' : 'Go for a drive';
      case 'topSpeedKmh':
        return `${Math.round(convertSpeed(progress))} / ${Math.round(convertSpeed(mission.target))} ${getSpeedLabel()}`;
      case 'distanceKm':
        return `${convertDistance(progress).toFixed(1)} / ${convertDistance(mission.target).toFixed(1)} ${getDistanceLabel()}`;
      case 'durationSec': {
        const mins = Math.floor(progress / 60);
        const tMins = Math.floor(mission.target / 60);
        return `${mins} / ${tMins} min`;
      }
      case 'corners':
        return `${Math.round(progress)} / ${mission.target} corners`;
      case 'maxGForce':
        return `${progress.toFixed(2)}G / ${mission.target.toFixed(2)}G`;
      case 'accel0to100':
        return progress > 0 ? `${progress.toFixed(2)}s (target <${mission.target}s)` : `Target <${mission.target}s`;
      case 'nightDrive':
        return progress >= 1 ? 'Night drive logged' : 'Drive between 9 PM – 5 AM';
      default:
        return '';
    }
  }, [mission, progress, convertSpeed, convertDistance, getSpeedLabel, getDistanceLabel, drovenToday]);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={[styles.streakBox, streakAlive && streakCount > 0 && styles.streakBoxActive]}>
          <View style={styles.streakInner}>
            <Animated.View style={{ transform: [{ scale: flameScale }] }}>
              <Flame
                size={22}
                color={streakAlive && streakCount > 0 ? '#FF6B00' : colors.textLight}
                fill={streakAlive && streakCount > 0 ? '#FF6B00' : 'transparent'}
              />
            </Animated.View>
            <View style={styles.streakTextWrap}>
              <View style={styles.streakValueRow}>
                <Text style={styles.streakValue}>{streakCount}</Text>
                <Text style={styles.streakLabel}>day{streakCount === 1 ? '' : 's'} streak</Text>
              </View>
              {!drovenToday && streakCount > 0 && (
                <Text style={styles.streakWarn}>Drive today to keep it alive</Text>
              )}
            </View>
          </View>
        </View>
      </View>

      <View style={styles.missionCard} testID="daily-mission-card">
        <View style={styles.missionHeader}>
          <View style={styles.missionIconBox}>
            <Text style={styles.missionIcon}>{mission.icon}</Text>
          </View>
          <View style={styles.missionTextWrap}>
            <View style={styles.missionTitleRow}>
              <Text style={styles.missionLabel}>DAILY MISSION</Text>
              {completed ? (
                <View style={styles.completeBadge}>
                  <Check size={10} color="#FFFFFF" />
                  <Text style={styles.completeBadgeText}>COMPLETE</Text>
                </View>
              ) : (
                <View style={styles.rewardBadge}>
                  <Target size={10} color={colors.accent} />
                  <Text style={styles.rewardBadgeText}>ACTIVE</Text>
                </View>
              )}
            </View>
            <Text style={styles.missionTitle}>{mission.title}</Text>
            <Text style={styles.missionDesc}>{mission.description}</Text>
          </View>
        </View>

        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: widthAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
                backgroundColor: completed ? '#00C853' : colors.accent,
              },
            ]}
          />
        </View>
        <Text style={styles.progressLabel}>{progressLabel}</Text>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  wrap: {
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  streakBox: {
    flex: 1,
    backgroundColor: colors.cardLight,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  streakInner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  streakTextWrap: {
    flex: 1,
  },
  streakValueRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: 8,
  },
  streakBoxActive: {
    borderColor: '#FF6B00',
    backgroundColor: '#FF6B0010',
  },
  streakValue: {
    fontSize: 26,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
    lineHeight: 30,
  },
  streakLabel: {
    fontSize: 10,
    fontFamily: 'Orbitron_500Medium',
    color: colors.textLight,
    letterSpacing: 0.5,
  },
  streakWarn: {
    fontSize: 9,
    fontFamily: 'Orbitron_500Medium',
    color: '#FF6B00',
    marginTop: 4,
  },

  missionCard: {
    backgroundColor: colors.cardLight,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  missionHeader: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  missionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.background,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  missionIcon: {
    fontSize: 22,
  },
  missionTextWrap: {
    flex: 1,
  },
  missionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 2,
  },
  missionLabel: {
    fontSize: 10,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.textLight,
    letterSpacing: 1,
  },
  missionTitle: {
    fontSize: 15,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
    marginTop: 2,
  },
  missionDesc: {
    fontSize: 12,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    marginTop: 2,
  },
  rewardBadge: {
    flexDirection: 'row',
    alignItems: 'center' as const,
    gap: 4,
    backgroundColor: colors.accent + '15',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  rewardBadgeText: {
    fontSize: 9,
    fontFamily: 'Orbitron_700Bold',
    color: colors.accent,
    letterSpacing: 0.5,
  },
  completeBadge: {
    flexDirection: 'row',
    alignItems: 'center' as const,
    gap: 4,
    backgroundColor: '#00C853',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  completeBadgeText: {
    fontSize: 9,
    fontFamily: 'Orbitron_700Bold',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  progressTrack: {
    height: 8,
    backgroundColor: colors.background,
    borderRadius: 4,
    overflow: 'hidden' as const,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressLabel: {
    fontSize: 11,
    fontFamily: 'Orbitron_500Medium',
    color: colors.textLight,
    marginTop: 6,
    textAlign: 'right' as const,
  },
});
