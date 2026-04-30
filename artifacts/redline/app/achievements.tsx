import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Platform,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { Stack, router } from 'expo-router';
import {
  Gauge,
  MapPin,
  Route,
  Map,
  Globe,
  Flag,
  Repeat,
  Award,
  Infinity as InfinityIcon,
  Flame,
  Users,
  Star,
  Zap,
  CornerDownRight,
  Rocket,
  Moon,
  Trophy,
  Lock,
  ChevronDown,
  Check,
  Clock,
} from 'lucide-react-native';
import { useSettings } from '@/providers/SettingsProvider';
import { useAchievements } from '@/providers/AchievementProvider';
import { ACHIEVEMENT_CATEGORIES } from '@/constants/achievements';
import { AchievementProgress, AchievementCategory } from '@/types/achievement';
import { ThemeColors } from '@/constants/colors';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ICON_MAP: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  'gauge': Gauge,
  'map-pin': MapPin,
  'route': Route,
  'map': Map,
  'globe': Globe,
  'flag': Flag,
  'repeat': Repeat,
  'award': Award,
  'infinity': InfinityIcon,
  'flame': Flame,
  'users': Users,
  'star': Star,
  'zap': Zap,
  'corner-down-right': CornerDownRight,
  'rocket': Rocket,
  'moon': Moon,
  'clock': Clock,
};

const CATEGORY_COLORS: Record<AchievementCategory, string> = {
  speed: '#FF3B30',
  distance: '#007AFF',
  trips: '#FF9500',
  streak: '#FF6B00',
  social: '#AF52DE',
  performance: '#30D158',
};

const CATEGORY_GRADIENTS: Record<AchievementCategory, { from: string; to: string }> = {
  speed: { from: '#FF3B30', to: '#FF6B6B' },
  distance: { from: '#007AFF', to: '#5AC8FA' },
  trips: { from: '#FF9500', to: '#FFCC00' },
  streak: { from: '#FF6B00', to: '#FF9F43' },
  social: { from: '#AF52DE', to: '#DA70D6' },
  performance: { from: '#30D158', to: '#7BED9F' },
};

function AnimatedProgressBar({ progress, threshold, color, isUnlocked }: {
  progress: number;
  threshold: number;
  color: string;
  isUnlocked: boolean;
}) {
  const animValue = useRef(new Animated.Value(0)).current;
  const percent = isUnlocked ? 100 : Math.min((progress / threshold) * 100, 100);

  useEffect(() => {
    Animated.timing(animValue, {
      toValue: percent,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [percent, animValue]);

  return (
    <View style={barStyles.wrapper}>
      <View style={[barStyles.track, { backgroundColor: color + '12' }]}>
        <Animated.View
          style={[
            barStyles.fill,
            {
              backgroundColor: isUnlocked ? color : color + 'AA',
              width: animValue.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>
      <Text style={[barStyles.percent, { color: isUnlocked ? color : color + '99' }]}>
        {Math.round(percent)}%
      </Text>
    </View>
  );
}

const barStyles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  track: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: 8,
    borderRadius: 4,
  },
  percent: {
    fontSize: 11,
    fontWeight: '700',
    width: 36,
    textAlign: 'right',
  },
});

function getProgressLabel(item: AchievementProgress): string {
  const { definition, progress, isUnlocked } = item;
  if (isUnlocked) return 'Completed';
  const current = Math.min(progress, definition.threshold);
  const unit = definition.unit ?? '';
  if (unit) {
    return `${Number(current.toFixed(1))} / ${definition.threshold} ${unit}`;
  }
  return `${Math.floor(current)} / ${definition.threshold}`;
}

const AchievementCard = React.memo(function AchievementCard({ item, colors, isNew }: {
  item: AchievementProgress;
  colors: ThemeColors;
  isNew: boolean;
}) {
  const scaleAnim = useRef(new Animated.Value(isNew ? 0.8 : 1)).current;

  useEffect(() => {
    if (isNew) {
      Animated.sequence([
        Animated.spring(scaleAnim, {
          toValue: 1.05,
          friction: 3,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 5,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isNew, scaleAnim]);

  const IconComponent = ICON_MAP[item.definition.icon] || Trophy;
  const categoryColor = CATEGORY_COLORS[item.definition.category];
  const isUnlocked = item.isUnlocked;
  const progressLabel = getProgressLabel(item);

  const formattedDate = item.unlockedAt
    ? new Date(item.unlockedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : undefined;

  const content = (
    <View style={[
      cardS.card,
      {
        backgroundColor: isUnlocked ? categoryColor + '08' : colors.cardLight,
        borderColor: isNew ? categoryColor : (isUnlocked ? categoryColor + '30' : colors.border + '60'),
        borderWidth: isNew ? 1.5 : 1,
      },
    ]}>
      <View style={cardS.row}>
        <View style={[
          cardS.iconContainer,
          {
            backgroundColor: isUnlocked ? categoryColor + '18' : colors.background,
          },
        ]}>
          {isUnlocked ? (
            <IconComponent size={20} color={categoryColor} />
          ) : (
            <Lock size={16} color={colors.textLight + '80'} />
          )}
        </View>
        <View style={cardS.content}>
          <View style={cardS.titleRow}>
            <Text
              style={[cardS.title, { color: isUnlocked ? colors.text : colors.textLight }]}
              numberOfLines={1}
            >
              {item.definition.title}
            </Text>
            {isNew && (
              <View style={[cardS.newBadge, { backgroundColor: categoryColor }]}>
                <Text style={cardS.newBadgeText}>NEW</Text>
              </View>
            )}
            {isUnlocked && !isNew && (
              <View style={[cardS.checkCircle, { backgroundColor: categoryColor + '20' }]}>
                <Check size={12} color={categoryColor} />
              </View>
            )}
          </View>
          <Text style={[cardS.description, { color: colors.textLight }]}>
            {item.definition.description}
          </Text>
        </View>
      </View>

      <View style={cardS.progressSection}>
        <AnimatedProgressBar
          progress={item.progress}
          threshold={item.definition.threshold}
          color={categoryColor}
          isUnlocked={isUnlocked}
        />
        <View style={cardS.progressMeta}>
          <Text style={[cardS.progressLabel, { color: isUnlocked ? categoryColor : colors.textLight }]}>
            {progressLabel}
          </Text>
          {formattedDate && (
            <Text style={[cardS.dateText, { color: categoryColor + 'AA' }]}>
              {formattedDate}
            </Text>
          )}
        </View>
      </View>
    </View>
  );

  if (isNew && Platform.OS !== 'web') {
    return (
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        {content}
      </Animated.View>
    );
  }

  return content;
});

const cardS = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  description: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  newBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  newBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  progressSection: {
    paddingLeft: 52,
  },
  progressMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  dateText: {
    fontSize: 10,
    fontWeight: '500',
  },
});

const CategorySection = React.memo(function CategorySection({
  category,
  achievements,
  colors,
  newlyUnlocked,
  isExpanded,
  onToggle,
}: {
  category: { key: string; label: string; icon: string };
  achievements: AchievementProgress[];
  colors: ThemeColors;
  newlyUnlocked: string[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const catColor = CATEGORY_COLORS[category.key as AchievementCategory] ?? colors.accent;
  const _gradient = CATEGORY_GRADIENTS[category.key as AchievementCategory];
  const IconComponent = ICON_MAP[category.icon] || Trophy;
  const unlockedInCat = achievements.filter(a => a.isUnlocked).length;
  const totalInCat = achievements.length;
  const catPercent = totalInCat > 0 ? (unlockedInCat / totalInCat) * 100 : 0;

  const catProgressAnim = useRef(new Animated.Value(0)).current;
  const chevronAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(catProgressAnim, {
      toValue: catPercent,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [catPercent, catProgressAnim]);

  useEffect(() => {
    Animated.timing(chevronAnim, {
      toValue: isExpanded ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [isExpanded, chevronAnim]);

  const sorted = useMemo(() => {
    return [...achievements].sort((a, b) => {
      if (a.isUnlocked && !b.isUnlocked) return -1;
      if (!a.isUnlocked && b.isUnlocked) return 1;
      if (a.isUnlocked && b.isUnlocked) {
        return (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0);
      }
      return 0;
    });
  }, [achievements]);

  const chevronRotation = chevronAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <View style={[secS.container, { backgroundColor: colors.cardLight, borderColor: colors.border + '60' }]}>
      <TouchableOpacity
        style={secS.header}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        <View style={[secS.iconWrap, { backgroundColor: catColor + '14' }]}>
          <IconComponent size={20} color={catColor} />
        </View>
        <View style={secS.headerContent}>
          <View style={secS.headerTitleRow}>
            <Text style={[secS.headerTitle, { color: colors.text }]}>{category.label}</Text>
            <View style={secS.headerRight}>
              <View style={[secS.countPill, { backgroundColor: catColor + '14' }]}>
                <Text style={[secS.countText, { color: catColor }]}>
                  {unlockedInCat}/{totalInCat}
                </Text>
              </View>
              <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
                <ChevronDown size={18} color={colors.textLight} />
              </Animated.View>
            </View>
          </View>
          <View style={secS.miniProgressRow}>
            <View style={[secS.miniTrack, { backgroundColor: catColor + '10' }]}>
              <Animated.View
                style={[
                  secS.miniFill,
                  {
                    backgroundColor: catColor,
                    width: catProgressAnim.interpolate({
                      inputRange: [0, 100],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>
            <Text style={[secS.miniPercent, { color: catColor + 'BB' }]}>
              {Math.round(catPercent)}%
            </Text>
          </View>
        </View>
      </TouchableOpacity>
      {isExpanded && (
        <View style={[secS.items, { borderTopColor: colors.border + '40' }]}>
          {sorted.map(item => (
            <AchievementCard
              key={item.definition.id}
              item={item}
              colors={colors}
              isNew={newlyUnlocked.includes(item.definition.id)}
            />
          ))}
        </View>
      )}
    </View>
  );
});

const secS = StyleSheet.create({
  container: {
    marginBottom: 10,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerContent: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  countText: {
    fontSize: 12,
    fontWeight: '700',
  },
  miniProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  miniTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  miniFill: {
    height: 5,
    borderRadius: 3,
  },
  miniPercent: {
    fontSize: 10,
    fontWeight: '700',
    width: 30,
    textAlign: 'right',
  },
  items: {
    paddingHorizontal: 10,
    paddingBottom: 10,
    paddingTop: 6,
    borderTopWidth: 1,
  },
});

export default function AchievementsScreen() {
  const { colors } = useSettings();
  const { getAchievementProgress, unlockedCount, totalCount, newlyUnlocked, clearNewlyUnlocked, streak, pendingCongrats, clearPendingCongrats } = useAchievements();
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const initial: Record<string, boolean> = {};
    ACHIEVEMENT_CATEGORIES.forEach(cat => {
      initial[cat.key] = false;
    });
    setExpandedCategories(initial);
  }, []);

  useEffect(() => {
    return () => {
      clearNewlyUnlocked();
    };
  }, [clearNewlyUnlocked]);

  useEffect(() => {
    if (pendingCongrats) {
      clearPendingCongrats();
      router.push({ pathname: '/challenge-complete', params: { achievementId: pendingCongrats } });
    }
  }, [pendingCongrats, clearPendingCongrats]);

  const achievements = useMemo(() => getAchievementProgress(), [getAchievementProgress]);

  const groupedAchievements = useMemo(() => {
    const groups: Record<string, AchievementProgress[]> = {};
    ACHIEVEMENT_CATEGORIES.forEach(cat => {
      groups[cat.key] = achievements.filter(a => a.definition.category === cat.key);
    });
    return groups;
  }, [achievements]);

  const toggleCategory = useCallback((key: string) => {
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setExpandedCategories(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const progressPercent = totalCount > 0 ? (unlockedCount / totalCount) * 100 : 0;
  const progressWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progressWidth, {
      toValue: progressPercent,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [progressPercent, progressWidth]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Achievements',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontSize: 16, fontWeight: '600' as const },
          headerTitleAlign: 'center',
        }}
      />
      <View style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerCard}>
            <View style={styles.headerTop}>
              <View style={styles.trophyContainer}>
                <Trophy size={26} color="#FFD700" />
              </View>
              <View style={styles.headerStats}>
                <Text style={styles.headerCount}>{unlockedCount}/{totalCount}</Text>
                <Text style={styles.headerLabel}>Achievements Unlocked</Text>
              </View>
              {streak.currentStreak > 0 && (
                <View style={styles.streakBadge}>
                  <Flame size={14} color="#FF6B00" />
                  <Text style={styles.streakText}>{streak.currentStreak}d</Text>
                </View>
              )}
            </View>
            <View style={styles.progressBar}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: progressWidth.interpolate({
                      inputRange: [0, 100],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {Math.round(progressPercent)}% complete
            </Text>
          </View>

          {ACHIEVEMENT_CATEGORIES.map(cat => (
            <CategorySection
              key={cat.key}
              category={cat}
              achievements={groupedAchievements[cat.key] ?? []}
              colors={colors}
              newlyUnlocked={newlyUnlocked}
              isExpanded={!!expandedCategories[cat.key]}
              onToggle={() => toggleCategory(cat.key)}
            />
          ))}
        </ScrollView>
      </View>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 40,
    },
    headerCard: {
      backgroundColor: colors.cardLight,
      borderRadius: 20,
      padding: 20,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border + '60',
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    trophyContainer: {
      width: 48,
      height: 48,
      borderRadius: 14,
      backgroundColor: '#FFD700' + '18',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    headerStats: {
      flex: 1,
    },
    headerCount: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.text,
      fontFamily: 'Orbitron_800ExtraBold',
    },
    headerLabel: {
      fontSize: 13,
      color: colors.textLight,
      marginTop: 1,
    },
    streakBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#FF6B00' + '18',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      gap: 4,
    },
    streakText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#FF6B00',
    },
    progressBar: {
      height: 8,
      backgroundColor: colors.background,
      borderRadius: 4,
      overflow: 'hidden',
    },
    progressFill: {
      height: 8,
      backgroundColor: colors.accent,
      borderRadius: 4,
    },
    progressText: {
      fontSize: 12,
      color: colors.textLight,
      marginTop: 8,
      textAlign: 'right',
    },
  });
}
