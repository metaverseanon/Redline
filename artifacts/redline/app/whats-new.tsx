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
import { Bell, Share2, Flag, Trophy, ChevronRight, Sparkles, X, TrendingUp } from 'lucide-react-native';
import OnboardPaywallPage from '@/components/OnboardPaywallPage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const WHATS_NEW_VERSION_KEY = 'whats_new_seen_version';
export const CURRENT_APP_VERSION = '1.9.8';

interface FeaturePage {
  id: string;
  icon: React.ReactNode;
  decorIcon: React.ReactNode;
  tag: string;
  title: string;
  highlight: string;
  description: string;
}

const features: FeaturePage[] = [
  {
    id: 'leave-notif',
    icon: <Bell size={48} color="#FFFFFF" strokeWidth={1.5} />,
    decorIcon: <Bell size={20} color="#CC0000" />,
    tag: 'FRIENDS BOARDS',
    title: 'Leave',
    highlight: 'Alerts',
    description: 'Own a private leaderboard? Get a push the moment any member joins or leaves your board — no more guessing who quit.',
  },
  {
    id: 'share-invite',
    icon: <Share2 size={48} color="#FFFFFF" strokeWidth={1.5} />,
    decorIcon: <Share2 size={20} color="#CC0000" />,
    tag: 'INVITES',
    title: 'Share In',
    highlight: 'Two Taps',
    description: 'Send a board invite through Messages, WhatsApp, Mail or anywhere with the native iOS share sheet. Friends join instantly.',
  },
  {
    id: 'custom-challenges',
    icon: <Flag size={48} color="#FFFFFF" strokeWidth={1.5} />,
    decorIcon: <Flag size={20} color="#CC0000" />,
    tag: 'CHALLENGES',
    title: 'Custom',
    highlight: 'Challenges',
    description: 'Owners can set a goal, target and timer for the whole board. Members get a push and a live banner with progress + countdown.',
  },
  {
    id: 'rank-up',
    icon: <TrendingUp size={48} color="#FFFFFF" strokeWidth={1.5} />,
    decorIcon: <Trophy size={20} color="#CC0000" />,
    tag: 'CELEBRATIONS',
    title: 'Rank Up',
    highlight: 'Confetti',
    description: 'Climb the leaderboard and the app erupts with confetti, haptics and a shiny new-rank card. Every win deserves a moment.',
  },
];

export default function WhatsNewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const iconRotate = useRef(new Animated.Value(0)).current;
  const badgePulse = useRef(new Animated.Value(1)).current;

  const TOTAL_PAGES = features.length + 1;
  const PAYWALL_INDEX = features.length;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.6, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 1500, useNativeDriver: true }),
      ]),
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(badgePulse, { toValue: 1.08, duration: 1200, useNativeDriver: true }),
        Animated.timing(badgePulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ]),
    ).start();
  }, [fadeAnim, slideAnim, pulseAnim, badgePulse]);

  useEffect(() => {
    iconRotate.setValue(0);
    Animated.spring(iconRotate, {
      toValue: 1,
      tension: 50,
      friction: 7,
      useNativeDriver: true,
    }).start();
  }, [currentPage, iconRotate]);

  const markSeen = async () => {
    try {
      await AsyncStorage.setItem(WHATS_NEW_VERSION_KEY, CURRENT_APP_VERSION);
    } catch (e) {
      console.warn('[WHATS_NEW] Failed to save seen version:', e);
    }
  };

  const dismiss = async () => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    await markSeen();
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      router.replace('/(tabs)/track' as any);
    });
  };

  const skipTop = async () => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    await dismiss();
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const page = Math.round(offsetX / SCREEN_WIDTH);
    if (page !== currentPage && page >= 0 && page < TOTAL_PAGES) {
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
    if (currentPage < TOTAL_PAGES - 1) {
      const nextPage = currentPage + 1;
      scrollViewRef.current?.scrollTo({ x: nextPage * SCREEN_WIDTH, animated: true });
      setCurrentPage(nextPage);
    } else {
      void dismiss();
    }
  };

  const handleBtnIn = () => {
    Animated.spring(buttonScale, { toValue: 0.95, tension: 300, friction: 10, useNativeDriver: true }).start();
  };
  const handleBtnOut = () => {
    Animated.spring(buttonScale, { toValue: 1, tension: 300, friction: 10, useNativeDriver: true }).start();
  };

  const isPaywallPage = currentPage === PAYWALL_INDEX;
  const isLastFeaturePage = currentPage === features.length - 1;

  const iconSpin = iconRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {!isPaywallPage && (
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <View style={styles.versionBadge}>
            <Animated.View style={{ transform: [{ scale: badgePulse }] }}>
              <Sparkles size={12} color="#CC0000" />
            </Animated.View>
            <Text style={styles.versionText}>NEW IN v{CURRENT_APP_VERSION}</Text>
          </View>
          <TouchableOpacity
            onPress={skipTop}
            style={styles.closeButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            testID="whats-new-close"
          >
            <X size={18} color="#8E8E93" />
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
        testID="whats-new-scroll"
      >
        {features.map((page, index) => (
          <View key={page.id} style={styles.page}>
            <View style={styles.pageContent}>
              <View style={styles.tagPill}>
                <Text style={styles.tagText}>{page.tag}</Text>
              </View>

              <Animated.View
                style={[
                  styles.iconContainer,
                  currentPage === index ? { transform: [{ rotate: iconSpin }] } : {},
                ]}
              >
                <View style={styles.iconGlow} />
                {page.icon}
              </Animated.View>

              <View style={styles.decorRow}>
                {page.decorIcon}
                <View style={styles.decorLine} />
                {page.decorIcon}
              </View>

              <Animated.View
                style={[
                  styles.textContainer,
                  { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
                ]}
              >
                <Text style={styles.title}>{page.title}</Text>
                <Text style={styles.highlight}>{page.highlight}</Text>
                <Text style={styles.description}>{page.description}</Text>
              </Animated.View>
            </View>
          </View>
        ))}

        <OnboardPaywallPage
          width={SCREEN_WIDTH}
          topInset={insets.top}
          bottomInset={insets.bottom}
          onContinue={() => void dismiss()}
          ctaLabel={undefined}
          skipLabel="Maybe later"
        />
      </ScrollView>

      {!isPaywallPage && (
        <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.pagination}>
            {Array.from({ length: TOTAL_PAGES }).map((_, index) => (
              <Animated.View
                key={index}
                style={[
                  styles.dot,
                  currentPage === index ? styles.dotActive : { opacity: pulseAnim },
                ]}
              />
            ))}
          </View>

          <Animated.View style={{ transform: [{ scale: buttonScale }], width: '100%' }}>
            <TouchableOpacity
              onPress={goToNext}
              onPressIn={handleBtnIn}
              onPressOut={handleBtnOut}
              style={[styles.nextButton, isLastFeaturePage && styles.nextButtonFinal]}
              activeOpacity={0.9}
              testID="whats-new-next"
            >
              <Text style={styles.nextButtonText}>
                {isLastFeaturePage ? 'See Pro' : 'Continue'}
              </Text>
              <ChevronRight size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}
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
  versionBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    backgroundColor: 'rgba(204, 0, 0, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(204, 0, 0, 0.3)',
  },
  versionText: {
    color: '#CC0000',
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 1.2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
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
  tagPill: {
    backgroundColor: 'rgba(204,0,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(204,0,0,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 24,
  },
  tagText: {
    color: '#CC0000',
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 1.5,
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
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center' as const,
    lineHeight: 22,
    maxWidth: 320,
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
});
