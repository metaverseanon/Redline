import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { MessageSquare, Award, Target, Flame, Sparkles, ChevronRight, X } from 'lucide-react-native';

const WHATS_NEW_VERSION_KEY = 'whats_new_seen_version';
export const CURRENT_APP_VERSION = '1.5.0';

interface Feature {
  id: string;
  icon: React.ReactNode;
  accentIcon: React.ReactNode;
  title: string;
  subtitle: string;
  description: string;
  tag: string;
}

const features: Feature[] = [
  {
    id: 'feed',
    icon: <MessageSquare size={36} color="#FFFFFF" strokeWidth={1.5} />,
    accentIcon: <Flame size={16} color="#FF6B35" />,
    title: 'Community Feed',
    subtitle: 'Share your drives',
    description: 'Post your best runs, share highlights with photos, and see what other drivers are up to. React and engage with the community.',
    tag: 'SOCIAL',
  },
  {
    id: 'challenges',
    icon: <Award size={36} color="#FFFFFF" strokeWidth={1.5} />,
    accentIcon: <Target size={16} color="#CC0000" />,
    title: 'Challenges & Badges',
    subtitle: 'Prove your skills',
    description: 'Take on speed, distance, and streak challenges. Earn bronze, silver, gold, and platinum badges as you complete milestones.',
    tag: 'COMPETE',
  },
];

export default function WhatsNewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-20)).current;
  const card1Anim = useRef(new Animated.Value(60)).current;
  const card1Opacity = useRef(new Animated.Value(0)).current;
  const card2Anim = useRef(new Animated.Value(60)).current;
  const card2Opacity = useRef(new Animated.Value(0)).current;
  const buttonAnim = useRef(new Animated.Value(40)).current;
  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const badgePulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(headerSlide, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
      Animated.stagger(150, [
        Animated.parallel([
          Animated.spring(card1Anim, { toValue: 0, tension: 60, friction: 9, useNativeDriver: true }),
          Animated.timing(card1Opacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.spring(card2Anim, { toValue: 0, tension: 60, friction: 9, useNativeDriver: true }),
          Animated.timing(card2Opacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.spring(buttonAnim, { toValue: 0, tension: 60, friction: 9, useNativeDriver: true }),
          Animated.timing(buttonOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]),
      ]),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(badgePulse, { toValue: 1.08, duration: 1200, useNativeDriver: true }),
        Animated.timing(badgePulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, [fadeAnim, headerSlide, card1Anim, card1Opacity, card2Anim, card2Opacity, buttonAnim, buttonOpacity, shimmerAnim, badgePulse]);

  const dismiss = async () => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    try {
      await AsyncStorage.setItem(WHATS_NEW_VERSION_KEY, CURRENT_APP_VERSION);
    } catch (e) {
      console.warn('[WHATS_NEW] Failed to save seen version:', e);
    }
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      router.replace('/(tabs)/track' as any);
    });
  };

  const shimmerOpacity = shimmerAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.15, 0.35, 0.15],
  });

  const cardAnims = [
    { translateY: card1Anim, opacity: card1Opacity },
    { translateY: card2Anim, opacity: card2Opacity },
  ];

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <View style={styles.bgAccent}>
        <Animated.View style={[styles.bgGlow, { opacity: shimmerOpacity }]} />
      </View>

      <View style={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={dismiss}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          testID="whats-new-close"
        >
          <X size={20} color="#8E8E93" />
        </TouchableOpacity>

        <Animated.View style={[styles.header, { transform: [{ translateY: headerSlide }] }]}>
          <View style={styles.versionBadge}>
            <Animated.View style={{ transform: [{ scale: badgePulse }] }}>
              <Sparkles size={14} color="#CC0000" />
            </Animated.View>
            <Text style={styles.versionText}>NEW IN v{CURRENT_APP_VERSION}</Text>
          </View>
          <Text style={styles.headerTitle}>What's New</Text>
          <Text style={styles.headerSubtitle}>
            Fresh features to level up your driving experience
          </Text>
        </Animated.View>

        <View style={styles.cardsContainer}>
          {features.map((feature, index) => (
            <Animated.View
              key={feature.id}
              style={[
                styles.featureCard,
                {
                  opacity: cardAnims[index].opacity,
                  transform: [{ translateY: cardAnims[index].translateY }],
                },
              ]}
            >
              <View style={styles.cardInner}>
                <View style={styles.cardLeft}>
                  <View style={styles.featureIconWrap}>
                    <View style={styles.featureIconBg} />
                    {feature.icon}
                  </View>
                </View>
                <View style={styles.cardRight}>
                  <View style={styles.tagRow}>
                    {feature.accentIcon}
                    <Text style={styles.tagText}>{feature.tag}</Text>
                  </View>
                  <Text style={styles.featureTitle}>{feature.title}</Text>
                  <Text style={styles.featureSubtitle}>{feature.subtitle}</Text>
                  <Text style={styles.featureDescription}>{feature.description}</Text>
                </View>
              </View>
              <View style={styles.cardEdge} />
            </Animated.View>
          ))}
        </View>

        <Animated.View style={[styles.bottomArea, { opacity: buttonOpacity, transform: [{ translateY: buttonAnim }] }]}>
          <TouchableOpacity
            style={styles.continueButton}
            onPress={dismiss}
            activeOpacity={0.85}
            testID="whats-new-continue"
          >
            <Text style={styles.continueText}>Let's Go</Text>
            <ChevronRight size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  bgAccent: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: 300,
    overflow: 'hidden',
  },
  bgGlow: {
    position: 'absolute' as const,
    top: -80,
    left: -40,
    right: -40,
    height: 300,
    borderRadius: 200,
    backgroundColor: '#CC0000',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  closeButton: {
    alignSelf: 'flex-end' as const,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginBottom: 8,
  },
  header: {
    alignItems: 'center' as const,
    marginBottom: 32,
  },
  versionBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    backgroundColor: 'rgba(204, 0, 0, 0.15)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(204, 0, 0, 0.3)',
    marginBottom: 20,
  },
  versionText: {
    color: '#CC0000',
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1.5,
  },
  headerTitle: {
    fontSize: 38,
    fontWeight: '800' as const,
    color: '#FFFFFF',
    textAlign: 'center' as const,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center' as const,
    lineHeight: 22,
    maxWidth: 280,
  },
  cardsContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    gap: 16,
  },
  featureCard: {
    backgroundColor: '#111111',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardInner: {
    flexDirection: 'row' as const,
    padding: 20,
    gap: 16,
  },
  cardLeft: {
    justifyContent: 'flex-start' as const,
    paddingTop: 4,
  },
  featureIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(204, 0, 0, 0.12)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: 'rgba(204, 0, 0, 0.25)',
  },
  featureIconBg: {
    position: 'absolute' as const,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(204, 0, 0, 0.04)',
  },
  cardRight: {
    flex: 1,
  },
  tagRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    marginBottom: 6,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: '#8E8E93',
    letterSpacing: 1.2,
  },
  featureTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  featureSubtitle: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: '#CC0000',
    marginBottom: 8,
  },
  featureDescription: {
    fontSize: 13,
    color: '#8E8E93',
    lineHeight: 19,
  },
  cardEdge: {
    height: 3,
    backgroundColor: '#CC0000',
    opacity: 0.6,
  },
  bottomArea: {
    paddingTop: 16,
  },
  continueButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#CC0000',
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
    shadowColor: '#CC0000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  continueText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
});
