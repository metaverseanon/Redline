import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { UserCheck, X, ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSettings } from '@/providers/SettingsProvider';
import { useAnalytics } from '@/providers/AnalyticsProvider';

interface AuthGateProps {
  visible: boolean;
  onClose: () => void;
  feature?: string;
}

export default function AuthGate({ visible, onClose, feature }: AuthGateProps) {
  const router = useRouter();
  const { colors } = useSettings();
  const { track } = useAnalytics();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(60)).current;

  useEffect(() => {
    if (visible) {
      track('auth_gate_shown', { feature });
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(60);
    }
  }, [visible, fadeAnim, slideAnim, feature, track]);

  const handleSignUp = () => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    track('auth_gate_sign_up_tapped', { feature });
    onClose();
    router.push('/profile' as any);
  };

  const handleDismiss = () => {
    track('auth_gate_dismissed', { feature });
    onClose();
  };

  const featureMessage = feature
    ? `Sign up to ${feature}`
    : 'Create an account to unlock all features';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleDismiss}
      testID="auth-gate-modal"
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <TouchableOpacity
          style={styles.overlayTouch}
          activeOpacity={1}
          onPress={handleDismiss}
        />
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.cardLight,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.handle} />

          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleDismiss}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <X size={20} color={colors.textLight} />
          </TouchableOpacity>

          <View style={styles.iconContainer}>
            <View style={[styles.iconCircle, { backgroundColor: '#CC000018' }]}>
              <UserCheck size={36} color="#CC0000" strokeWidth={1.5} />
            </View>
          </View>

          <Text style={[styles.title, { color: colors.text }]}>
            Join the Community
          </Text>

          <Text style={[styles.subtitle, { color: colors.textLight }]}>
            {featureMessage}. Save your stats, climb the leaderboard, and connect with drivers worldwide.
          </Text>

          <TouchableOpacity
            style={styles.signUpButton}
            onPress={handleSignUp}
            activeOpacity={0.85}
            testID="auth-gate-sign-up"
          >
            <Text style={styles.signUpButtonText}>Create Account</Text>
            <ChevronRight size={18} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.laterButton}
            onPress={handleDismiss}
            activeOpacity={0.7}
          >
            <Text style={[styles.laterButtonText, { color: colors.textLight }]}>
              Maybe Later
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  overlayTouch: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
    alignItems: 'center' as const,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.3)',
    marginBottom: 16,
  },
  closeButton: {
    position: 'absolute' as const,
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(128,128,128,0.12)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  iconContainer: {
    marginBottom: 16,
    marginTop: 8,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Orbitron_700Bold',
    textAlign: 'center' as const,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Orbitron_400Regular',
    textAlign: 'center' as const,
    lineHeight: 22,
    marginBottom: 28,
    paddingHorizontal: 12,
  },
  signUpButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#CC0000',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    width: '100%' as any,
    gap: 8,
    shadowColor: '#CC0000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  signUpButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Orbitron_700Bold',
    letterSpacing: 0.5,
  },
  laterButton: {
    marginTop: 16,
    paddingVertical: 10,
  },
  laterButtonText: {
    fontSize: 14,
    fontFamily: 'Orbitron_500Medium',
  },
});
