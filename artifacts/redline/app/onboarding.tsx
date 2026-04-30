import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
  Platform,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Activity, Crown, Compass, UserCheck, ChevronRight, Flame, Target, Radio, Trophy, Star, MessageSquare, Award, Eye } from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ONBOARDING_KEY = 'onboarding_completed';

interface OnboardingPage {
  id: string;
  icon: React.ReactNode;
  decorIcon: React.ReactNode;
  title: string;
  highlight: string;
  description: string;
  gradient: string[];
}

const pages: OnboardingPage[] = [
  {
    id: 'track',
    icon: <Activity size={48} color="#FFFFFF" strokeWidth={1.5} />,
    decorIcon: <Flame size={20} color="#CC0000" />,
    title: 'Track Your',
    highlight: 'Drives',
    description: 'Real-time speed, distance, acceleration times and route mapping for every drive you take.',
    gradient: ['#1a0000', '#000000'],
  },
  {
    id: 'compete',
    icon: <Crown size={48} color="#FFFFFF" strokeWidth={1.5} />,
    decorIcon: <Target size={20} color="#CC0000" />,
    title: 'Climb The',
    highlight: 'Leaderboard',
    description: 'Compete with drivers worldwide. Top speed, longest distance, best acceleration — claim your rank.',
    gradient: ['#0a0a0a', '#000000'],
  },
  {
    id: 'achievements',
    icon: <Trophy size={48} color="#FFFFFF" strokeWidth={1.5} />,
    decorIcon: <Star size={20} color="#CC0000" />,
    title: 'Unlock',
    highlight: 'Achievements',
    description: 'Complete driving challenges across speed, distance, streaks and more. Track your progress and show off your badges.',
    gradient: ['#0a0a00', '#000000'],
  },
  {
    id: 'feed',
    icon: <MessageSquare size={48} color="#FFFFFF" strokeWidth={1.5} />,
    decorIcon: <Flame size={20} color="#CC0000" />,
    title: 'Share On',
    highlight: 'The Feed',
    description: 'Post your best runs, share drive highlights, and see what other drivers are up to in real time.',
    gradient: ['#0a0000', '#000000'],
  },
  {
    id: 'challenges',
    icon: <Award size={48} color="#FFFFFF" strokeWidth={1.5} />,
    decorIcon: <Target size={20} color="#CC0000" />,
    title: 'Complete',
    highlight: 'Challenges',
    description: 'Take on speed, distance, and streak challenges. Earn badges and show off your driving milestones.',
    gradient: ['#0d0d00', '#000000'],
  },
  {
    id: 'ping',
    icon: <Compass size={48} color="#FFFFFF" strokeWidth={1.5} />,
    decorIcon: <Radio size={20} color="#CC0000" />,
    title: 'Find Nearby',
    highlight: 'Drivers',
    description: 'Ping drivers around you, get directions to meet up and cruise together.',
    gradient: ['#0d0000', '#000000'],
  },
  {
    id: 'account',
    icon: <UserCheck size={48} color="#FFFFFF" strokeWidth={1.5} />,
    decorIcon: <ChevronRight size={20} color="#CC0000" />,
    title: 'Create Your',
    highlight: 'Account',
    description: 'Sign up to save your stats, appear on the leaderboard, and connect with the car community.',
    gradient: ['#1a0000', '#000000'],
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const iconRotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.6,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [fadeAnim, slideAnim, pulseAnim]);

  useEffect(() => {
    iconRotate.setValue(0);
    Animated.spring(iconRotate, {
      toValue: 1,
      tension: 50,
      friction: 7,
      useNativeDriver: true,
    }).start();
  }, [currentPage, iconRotate]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const page = Math.round(offsetX / SCREEN_WIDTH);
    if (page !== currentPage && page >= 0 && page < pages.length) {
      setCurrentPage(page);
      if (Platform.OS !== 'web') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  };

  const goToNext = () => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (currentPage < pages.length - 1) {
      const nextPage = currentPage + 1;
      scrollViewRef.current?.scrollTo({
        x: nextPage * SCREEN_WIDTH,
        animated: true,
      });
      setCurrentPage(nextPage);
    } else {
      void completeOnboarding();
    }
  };

  const completeOnboarding = async (destination: string = '/(tabs)/track') => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    } catch (e) {
      console.warn('[ONBOARDING] Failed to save completion:', e);
    }

    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      router.replace(destination as any);
    });
  };

  const browseFirst = async () => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    console.log('[ONBOARDING] User chose to browse first');
    void completeOnboarding('/(tabs)/leaderboard');
  };

  const skipOnboarding = async () => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    void completeOnboarding();
  };

  const handleButtonPressIn = () => {
    Animated.spring(buttonScale, {
      toValue: 0.95,
      tension: 300,
      friction: 10,
      useNativeDriver: true,
    }).start();
  };

  const handleButtonPressOut = () => {
    Animated.spring(buttonScale, {
      toValue: 1,
      tension: 300,
      friction: 10,
      useNativeDriver: true,
    }).start();
  };

  const isLastPage = currentPage === pages.length - 1;

  const iconSpin = iconRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {!isLastPage && (
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <View />
          <TouchableOpacity
            onPress={skipOnboarding}
            style={styles.skipButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            testID="onboarding-skip"
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        bounces={false}
        testID="onboarding-scroll"
      >
        {pages.map((page, index) => (
          <View key={page.id} style={styles.page}>
            <View style={styles.pageContent}>
              <Animated.View style={[
                styles.iconContainer,
                currentPage === index ? {
                  transform: [{ rotate: iconSpin }],
                } : {},
              ]}>
                <View style={styles.iconGlow} />
                {page.icon}
              </Animated.View>

              <View style={styles.decorRow}>
                {page.decorIcon}
                <View style={styles.decorLine} />
                {page.decorIcon}
              </View>

              <Animated.View style={[
                styles.textContainer,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}>
                <Text style={styles.title}>{page.title}</Text>
                <Text style={styles.highlight}>{page.highlight}</Text>
                <Text style={styles.description}>{page.description}</Text>
              </Animated.View>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.pagination}>
          {pages.map((_, index) => (
            <Animated.View
              key={index}
              style={[
                styles.dot,
                currentPage === index
                  ? styles.dotActive
                  : { opacity: pulseAnim },
              ]}
            />
          ))}
        </View>

        <Animated.View style={{ transform: [{ scale: buttonScale }], width: '100%' }}>
          <TouchableOpacity
            onPress={goToNext}
            onPressIn={handleButtonPressIn}
            onPressOut={handleButtonPressOut}
            style={[styles.nextButton, isLastPage && styles.nextButtonFinal]}
            activeOpacity={0.9}
            testID="onboarding-next"
          >
            <Text style={styles.nextButtonText}>
              {isLastPage ? "Create Account" : 'Continue'}
            </Text>
            {!isLastPage && <ChevronRight size={20} color="#FFFFFF" />}
          </TouchableOpacity>
        </Animated.View>

        {isLastPage && (
          <TouchableOpacity
            onPress={browseFirst}
            style={styles.browseButton}
            activeOpacity={0.7}
            testID="onboarding-browse"
          >
            <Eye size={16} color="#8E8E93" />
            <Text style={styles.browseText}>Browse first without account</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topBar: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 20,
    paddingBottom: 8,
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },

  skipButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  skipText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '500' as const,
    letterSpacing: 0.3,
  },
  page: {
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  pageContent: {
    alignItems: 'center' as const,
    paddingHorizontal: 32,
    marginTop: -40,
  },
  iconContainer: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(204, 0, 0, 0.12)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: 'rgba(204, 0, 0, 0.3)',
  },
  iconGlow: {
    position: 'absolute' as const,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(204, 0, 0, 0.06)',
  },
  decorRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: 28,
    gap: 12,
  },
  decorLine: {
    width: 40,
    height: 1,
    backgroundColor: 'rgba(204, 0, 0, 0.4)',
  },
  textContainer: {
    alignItems: 'center' as const,
  },
  title: {
    fontSize: 28,
    fontWeight: '300' as const,
    color: '#8E8E93',
    textAlign: 'center' as const,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
  highlight: {
    fontSize: 42,
    fontWeight: '800' as const,
    color: '#FFFFFF',
    textAlign: 'center' as const,
    marginTop: 4,
    marginBottom: 20,
    letterSpacing: -0.5,
  },
  description: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center' as const,
    lineHeight: 24,
    maxWidth: 300,
  },
  bottomSection: {
    paddingHorizontal: 24,
    alignItems: 'center' as const,
    gap: 24,
  },
  pagination: {
    flexDirection: 'row' as const,
    gap: 10,
    alignItems: 'center' as const,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3A3A3C',
  },
  dotActive: {
    width: 28,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#CC0000',
  },
  nextButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#CC0000',
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
    width: '100%' as any,
  },
  nextButtonFinal: {
    backgroundColor: '#CC0000',
    shadowColor: '#CC0000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  browseButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    paddingVertical: 12,
  },
  browseText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '500' as const,
    letterSpacing: 0.3,
  },
});
