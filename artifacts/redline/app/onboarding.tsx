import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
  TextInput,
  Modal,
  FlatList,
  ActivityIndicator,
  Alert,
  ScrollView,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withDelay,
  withSequence,
  Easing,
  FadeIn,
  FadeInDown,
  cancelAnimation,
} from 'react-native-reanimated';
import {
  Users,
  ChevronRight,
  ChevronDown,
  Check,
  Camera,
  Navigation,
  AlertTriangle,
  Hand,
  Car,
  Smartphone,
  Eye,
  Star,
  Heart,
  Sparkles,
  Zap,
  Search,
  X,
  Hash,
  Trophy,
  Mail,
  Lock,
} from 'lucide-react-native';
import OnboardPaywallPage from '@/components/OnboardPaywallPage';
import { useUser } from '@/providers/UserProvider';
import { trpcClient } from '@/lib/trpc';
import { useSettings, SpeedUnit } from '@/providers/SettingsProvider';
import { CAR_BRANDS, getModelsForBrand } from '@/constants/cars';

WebBrowser.maybeCompleteAuthSession();

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ONBOARDING_KEY = 'onboarding_completed';

const IS_WEB = Platform.OS === 'web';
const enterFade = () => (IS_WEB ? undefined : FadeIn.duration(400));
const enterFadePlain = () => (IS_WEB ? undefined : FadeIn);
const enterFadeDown = (delay: number) =>
  IS_WEB ? undefined : FadeInDown.delay(delay).duration(420);
// Reanimated layout-entering wrappers collapse to opacity:0 / blank on
// react-native-web (esp. when nested). Web is only a preview stub here, so we
// fall back to plain View/Image on web; native keeps the entering animations.
const AView: typeof Animated.View = (IS_WEB ? View : Animated.View) as typeof Animated.View;
const AImage: typeof Animated.Image = (IS_WEB ? Image : Animated.Image) as typeof Animated.Image;

const RED = '#CC0000';
const RED_SOFT = 'rgba(204,0,0,0.14)';
const RED_BORDER = 'rgba(204,0,0,0.35)';
const BG = '#000000';
const CARD = '#1C1C1E';
const CARD_LIGHT = '#2C2C2E';
const TEXT = '#FFFFFF';
const TEXT_DIM = '#8E8E93';
const TRACK = '#2C2C2E';

const FONT_BLACK = 'Orbitron_900Black';
const FONT_XBOLD = 'Orbitron_800ExtraBold';
const FONT_BOLD = 'Orbitron_700Bold';
const FONT_SEMI = 'Orbitron_600SemiBold';

const STEPS = [
  'hero',
  'crew',
  'signin',
  'signedin',
  'unit',
  'ride',
  'photo',
  'rating',
  'name',
  'location',
  'safety',
  'setup',
  'social',
  'paywall',
] as const;
type StepKey = (typeof STEPS)[number];

const SETUP_START = STEPS.indexOf('unit');
const SETUP_END = STEPS.indexOf('setup');
const SETUP_COUNT = SETUP_END - SETUP_START + 1;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);
const AnimatedPath = Animated.createAnimatedComponent(Path);

// Speed → color gradient (green → red), mirrors the track-screen gauge.
function speedColorFor(speed: number): string {
  const maxSpeed = 200;
  const clamped = Math.min(Math.max(speed, 0), maxSpeed);
  const ratio = clamped / maxSpeed;
  const r = Math.round(255 * ratio);
  const g = Math.round(200 + (71 - 200) * ratio);
  const b = Math.round(83 + (87 - 83) * ratio);
  return `rgb(${r}, ${g}, ${b})`;
}

function describeArcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const toRad = (a: number) => ((a - 90) * Math.PI) / 180;
  const sx = cx + r * Math.cos(toRad(startAngle));
  const sy = cy + r * Math.sin(toRad(startAngle));
  const ex = cx + r * Math.cos(toRad(endAngle));
  const ey = cy + r * Math.sin(toRad(endAngle));
  const large = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`;
}

/* ----------------------------- Brand logos ----------------------------- */

function brandLogoUrl(name: string): string | null {
  if (!name || name === 'Other') return null;
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-');
  return `https://cdn.jsdelivr.net/gh/filippofilip95/car-logos-dataset@master/logos/optimized/${slug}.png`;
}

function BrandLogo({
  name,
  size,
  fallbackIconSize,
}: {
  name: string;
  size: number;
  fallbackIconSize?: number;
}) {
  const [failed, setFailed] = useState(false);
  const url = brandLogoUrl(name);
  useEffect(() => {
    setFailed(false);
  }, [name]);
  if (!url || failed) {
    return <Car size={fallbackIconSize ?? Math.round(size * 0.7)} color={TEXT_DIM} />;
  }
  return (
    <Image
      source={{ uri: url }}
      style={{ width: size, height: size }}
      resizeMode="contain"
      onError={() => setFailed(true)}
    />
  );
}

const haptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Medium) => {
  if (Platform.OS !== 'web') void Haptics.impactAsync(style);
};
const hapticSuccess = () => {
  if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
};

/* ----------------------------- Speedometer ----------------------------- */

function Speedometer({
  target,
  max,
  unitLabel,
  size = 240,
}: {
  target: number;
  max: number;
  unitLabel: string;
  size?: number;
}) {
  // Matches the track-screen gauge: 270° sweep (135°→405°), thin round-capped
  // arc, a dot at the tip, big Orbitron readout, on a dark circular face.
  const STROKE = 8;
  const CENTER = size / 2;
  const RADIUS = (size - STROKE) / 2 - 8;
  const START = 135;
  const SWEEP = 270;

  const arcColor = useMemo(() => speedColorFor(target), [target]);

  const progress = useSharedValue(0);
  const display = useSharedValue(0);

  useEffect(() => {
    const frac = Math.max(0, Math.min(1, target / max));
    progress.value = withTiming(frac, { duration: 1500, easing: Easing.out(Easing.cubic) });
    display.value = withTiming(target, { duration: 1500, easing: Easing.out(Easing.cubic) });
  }, [target, max, progress, display]);

  const bgPath = useMemo(
    () => describeArcPath(CENTER, CENTER, RADIUS, START, START + SWEEP),
    [CENTER, RADIUS],
  );

  const arcProps = useAnimatedProps(() => {
    const angle = START + SWEEP * progress.value;
    const toRad = (a: number) => ((a - 90) * Math.PI) / 180;
    const sx = CENTER + RADIUS * Math.cos(toRad(START));
    const sy = CENTER + RADIUS * Math.sin(toRad(START));
    const ex = CENTER + RADIUS * Math.cos(toRad(angle));
    const ey = CENTER + RADIUS * Math.sin(toRad(angle));
    const large = angle - START <= 180 ? 0 : 1;
    const d = progress.value <= 0.001 ? '' : `M ${sx} ${sy} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${ex} ${ey}`;
    return { d } as any;
  });

  const dotProps = useAnimatedProps(() => {
    const angle = START + SWEEP * progress.value;
    const toRad = (a: number) => ((a - 90) * Math.PI) / 180;
    return {
      cx: CENTER + RADIUS * Math.cos(toRad(angle)),
      cy: CENTER + RADIUS * Math.sin(toRad(angle)),
    } as any;
  });

  const numberProps = useAnimatedProps(
    () => ({ text: String(Math.round(display.value)) } as any),
  );

  return (
    <View style={[styles.gaugeOuter, { width: size, height: size, borderRadius: size / 2 }]}>
      <Svg width={size} height={size}>
        <Path d={bgPath} stroke="#2A2A2A" strokeWidth={STROKE} fill="none" strokeLinecap="round" />
        <AnimatedPath animatedProps={arcProps} stroke={arcColor} strokeWidth={STROKE} fill="none" strokeLinecap="round" />
        <AnimatedCircle animatedProps={dotProps} r={5} fill={arcColor} />
      </Svg>
      <View style={styles.speedoCenter} pointerEvents="none">
        <AnimatedTextInput
          editable={false}
          defaultValue="0"
          animatedProps={numberProps}
          style={styles.speedoNumber}
        />
        <Text style={styles.speedoUnit}>{unitLabel}</Text>
      </View>
    </View>
  );
}

/* ----------------------------- Progress bar ----------------------------- */

function ProgressBar({ progress }: { progress: number }) {
  const w = useSharedValue(progress);
  useEffect(() => {
    w.value = withTiming(progress, { duration: 450, easing: Easing.out(Easing.cubic) });
  }, [progress, w]);
  const style = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, style]} />
    </View>
  );
}

/* ----------------------------- Crew row ----------------------------- */

const CREW = [
  { rank: 1, name: 'alex', value: '126', color: '#FFD700' },
  { rank: 2, name: 'daniel', value: '113', color: '#C0C0C0', you: true },
  { rank: 3, name: 'sam', value: '97', color: '#CD7F32' },
];

function CrewRow({
  item,
  unit,
  delay,
}: {
  item: (typeof CREW)[number];
  unit: string;
  delay: number;
}) {
  return (
    <AView
      entering={enterFadeDown(delay)}
      style={[styles.crewRow, item.you && styles.crewRowYou]}
    >
      <View style={[styles.crewRank, { backgroundColor: item.color }]}>
        <Text style={styles.crewRankText}>{item.rank}</Text>
      </View>
      <View style={[styles.crewAvatar, item.you && { borderColor: RED }]}>
        <Text style={styles.crewAvatarText}>{item.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.crewNameRow}>
          <Text style={[styles.crewName, item.you && { color: RED }]}>{item.name}</Text>
          {item.you && (
            <View style={styles.youBadge}>
              <Text style={styles.youBadgeText}>YOU</Text>
            </View>
          )}
        </View>
        <Text style={styles.crewSub}>top speed</Text>
      </View>
      <Text style={[styles.crewValue, item.rank === 1 && { color: RED }]}>
        {item.value} <Text style={styles.crewValueUnit}>{unit}</Text>
      </Text>
    </AView>
  );
}

/* ----------------------------- Setup loader ----------------------------- */

function SetupLoader() {
  const rot = useSharedValue(0);
  const pulse = useSharedValue(0.6);
  useEffect(() => {
    rot.value = withRepeat(withTiming(360, { duration: 1100, easing: Easing.linear }), -1);
    pulse.value = withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0.5, { duration: 700 })), -1);
    return () => {
      cancelAnimation(rot);
      cancelAnimation(pulse);
    };
  }, [rot, pulse]);
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <View style={styles.loaderWrap}>
      <Animated.View style={[styles.loaderGlow, glowStyle]} />
      <Animated.View style={[styles.loaderRing, ringStyle]} />
      <View style={styles.loaderCore}>
        <Zap size={28} color={RED} fill={RED} />
      </View>
    </View>
  );
}

/* ----------------------------- Star rating ----------------------------- */

function StarRating({ onRate }: { onRate: () => void }) {
  const glow = useSharedValue(0.6);
  useEffect(() => {
    glow.value = withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0.55, { duration: 900 })), -1);
    return () => cancelAnimation(glow);
  }, [glow]);
  const style = useAnimatedStyle(() => ({ opacity: glow.value }));
  return (
    <Animated.View style={[styles.starsRow, style]}>
      {[0, 1, 2, 3, 4].map((i) => (
        <TouchableOpacity
          key={i}
          activeOpacity={0.7}
          onPress={() => {
            haptic(Haptics.ImpactFeedbackStyle.Light);
            onRate();
          }}
        >
          <Star size={44} color={RED} fill={RED} />
        </TouchableOpacity>
      ))}
    </Animated.View>
  );
}

/* ----------------------------- Picker modal ----------------------------- */

function PickerModal({
  visible,
  title,
  data,
  onSelect,
  onClose,
  renderLeading,
}: {
  visible: boolean;
  title: string;
  data: string[];
  onSelect: (value: string) => void;
  onClose: () => void;
  renderLeading?: (item: string) => React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const s = search.toLowerCase();
    return data.filter((d) => d.toLowerCase().includes(s));
  }, [search, data]);

  useEffect(() => {
    if (!visible) setSearch('');
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <X size={22} color={TEXT_DIM} />
            </TouchableOpacity>
          </View>
          <View style={styles.searchBox}>
            <Search size={16} color={TEXT_DIM} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search"
              placeholderTextColor={TEXT_DIM}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
            />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.pickerRow}
                onPress={() => {
                  haptic(Haptics.ImpactFeedbackStyle.Light);
                  onSelect(item);
                }}
              >
                {renderLeading ? <View style={styles.pickerRowLeading}>{renderLeading(item)}</View> : null}
                <Text style={styles.pickerRowText}>{item}</Text>
                <ChevronRight size={16} color={TEXT_DIM} />
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.pickerEmpty}>No matches</Text>}
          />
        </View>
      </View>
    </Modal>
  );
}

/* ----------------------------- Main screen ----------------------------- */

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signInWithApple, signInWithGoogle, signUp, signIn, createLocalUser, updateProfile, updateCar, syncImagesToBackend } = useUser();
  const { settings, setSpeedUnit, getSpeedLabel } = useSettings();

  const [stepIndex, setStepIndex] = useState(0);
  const step: StepKey = STEPS[stepIndex];

  const [isAppleAvailable, setIsAppleAvailable] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);

  const [showEmailAuth, setShowEmailAuth] = useState(false);
  const [emailMode, setEmailMode] = useState<'signup' | 'signin'>('signup');
  const [emailValue, setEmailValue] = useState('');
  const [passwordValue, setPasswordValue] = useState('');
  const [emailName, setEmailName] = useState('');

  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [showBrandPicker, setShowBrandPicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [carPhoto, setCarPhoto] = useState('');
  const [username, setUsername] = useState('');
  const [checkingName, setCheckingName] = useState(false);
  const [nameError, setNameError] = useState('');
  const ratingRequestedRef = useRef(false);
  const [locationGranted, setLocationGranted] = useState(false);
  const [ackSafety, setAckSafety] = useState(false);
  const [ackTerms, setAckTerms] = useState(false);

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: '229508757301-qu9290kh0vb6ijl7jpmftbkmbpotnn6m.apps.googleusercontent.com',
    iosClientId: '229508757301-kdqacnt706ifo720d6ftp617s8itd825.apps.googleusercontent.com',
    androidClientId: '229508757301-qvgii47v29imbk4qe99la4hv9shvgqm2.apps.googleusercontent.com',
  });

  const goTo = useCallback((index: number) => {
    setStepIndex(Math.max(0, Math.min(STEPS.length - 1, index)));
  }, []);

  const goNext = useCallback(() => {
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    setStepIndex((i) => Math.min(STEPS.length - 1, i + 1));
  }, []);

  const onSignedIn = useCallback(() => {
    hapticSuccess();
    setStepIndex(STEPS.indexOf('signedin'));
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    void AppleAuthentication.isAvailableAsync()
      .then(setIsAppleAvailable)
      .catch(() => setIsAppleAvailable(false));
  }, []);

  const handleGoogleToken = useCallback(
    async (accessToken: string) => {
      setAuthBusy(true);
      try {
        const res = await fetch('https://www.googleapis.com/userinfo/v2/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const gUser = await res.json();
        if (gUser.email) {
          await signInWithGoogle(gUser.email, gUser.name || gUser.email.split('@')[0], gUser.picture);
          onSignedIn();
        } else {
          Alert.alert('Sign in failed', 'Could not retrieve your Google email. Please try again.');
        }
      } catch (e) {
        console.error('[ONBOARDING] Google sign-in error:', e);
        Alert.alert('Sign in failed', 'Failed to sign in with Google. Please try again.');
      } finally {
        setAuthBusy(false);
      }
    },
    [signInWithGoogle, onSignedIn],
  );

  useEffect(() => {
    if (response?.type === 'success') {
      const token = response.authentication?.accessToken;
      if (token) void handleGoogleToken(token);
    }
  }, [response, handleGoogleToken]);

  const handleGoogle = useCallback(async () => {
    haptic(Haptics.ImpactFeedbackStyle.Light);
    try {
      await promptAsync();
    } catch (e) {
      console.error('[ONBOARDING] Google prompt error:', e);
      Alert.alert('Sign in failed', 'Failed to open Google sign in. Please try again.');
    }
  }, [promptAsync]);

  const handleApple = useCallback(async () => {
    if (authBusy) return;
    setAuthBusy(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const fullName = credential.fullName
        ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(' ').trim()
        : null;
      await signInWithApple(credential.user, credential.email, fullName || null);
      onSignedIn();
    } catch (e: any) {
      if (e?.code === 'ERR_REQUEST_CANCELED') return;
      console.error('[ONBOARDING] Apple sign-in error:', e);
      Alert.alert('Sign in failed', 'Failed to sign in with Apple. Please try again.');
    } finally {
      setAuthBusy(false);
    }
  }, [authBusy, signInWithApple, onSignedIn]);

  const handleEmailAuth = useCallback(async () => {
    if (authBusy) return;
    const email = emailValue.trim().toLowerCase();
    const password = passwordValue;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Your password must be at least 6 characters.');
      return;
    }
    haptic(Haptics.ImpactFeedbackStyle.Light);
    setAuthBusy(true);
    try {
      if (emailMode === 'signup') {
        const displayName = emailName.trim() || email.split('@')[0];
        await signUp(email, displayName, password);
      } else {
        const result = await signIn(email, password);
        if (!result.success) {
          const msg =
            result.error === 'incorrect_password'
              ? 'Incorrect email or password.'
              : result.message || 'Could not sign you in. Please try again.';
          Alert.alert('Sign in failed', msg);
          return;
        }
      }
      setShowEmailAuth(false);
      setPasswordValue('');
      onSignedIn();
    } catch (e: any) {
      console.error('[ONBOARDING] Email auth error:', e);
      Alert.alert(
        emailMode === 'signup' ? 'Sign up failed' : 'Sign in failed',
        e?.message || 'Something went wrong. Please try again.',
      );
    } finally {
      setAuthBusy(false);
    }
  }, [authBusy, emailMode, emailValue, passwordValue, emailName, signUp, signIn, onSignedIn]);

  useEffect(() => {
    if (step === 'name' && !username && user?.displayName) {
      setUsername(user.displayName);
    }
  }, [step, username, user?.displayName]);

  const pickPhoto = useCallback(async () => {
    haptic(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Add Photo', 'Choose an option', [
      {
        text: 'Take Photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission needed', 'Camera permission is required to take photos.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [16, 9], quality: 0.8 });
          if (!result.canceled) setCarPhoto(result.assets[0].uri);
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [16, 9],
            quality: 0.8,
          });
          if (!result.canceled) setCarPhoto(result.assets[0].uri);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, []);

  const persistCar = useCallback(async () => {
    if (user && brand && model) {
      try {
        await updateCar(brand, model, carPhoto || undefined);
      } catch (e) {
        console.warn('[ONBOARDING] persist car failed:', e);
      }
    }
  }, [user, brand, model, carPhoto, updateCar]);

  const requestLocation = useCallback(async () => {
    haptic(Haptics.ImpactFeedbackStyle.Light);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationGranted(status === 'granted');
      if (status === 'granted') hapticSuccess();
    } catch (e) {
      console.warn('[ONBOARDING] location permission error:', e);
    }
  }, []);

  const handleRideContinue = useCallback(async () => {
    await persistCar();
    goNext();
  }, [persistCar, goNext]);

  const handlePhotoContinue = useCallback(async () => {
    await persistCar();
    goNext();
  }, [persistCar, goNext]);

  const requestAppRating = useCallback(async () => {
    if (ratingRequestedRef.current) return;
    ratingRequestedRef.current = true;
    haptic(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === 'web') return;
    // Apple's in-app StoreReview prompt is silently suppressed in TestFlight /
    // dev builds and is rate-limited in production, so it never reliably appears
    // from an explicit "rate us" tap. Open the App Store review page directly —
    // the standard, Apple-compliant pattern for a user-initiated rating action.
    const reviewUrl =
      Platform.OS === 'ios'
        ? 'itms-apps://apps.apple.com/app/id6758342404?action=write-review'
        : 'market://details?id=app.rork.redline-app';
    try {
      await Linking.openURL(reviewUrl);
    } catch (e) {
      console.warn('[ONBOARDING] open store review url failed:', e);
      try {
        const StoreReview = await import('expo-store-review');
        if ((await StoreReview.isAvailableAsync()) && (await StoreReview.hasAction())) {
          await StoreReview.requestReview();
        }
      } catch (err) {
        console.warn('[ONBOARDING] store review fallback failed:', err);
        // Both paths failed — allow the user to try again this session.
        ratingRequestedRef.current = false;
      }
    }
  }, []);

  const handleNameContinue = useCallback(async () => {
    const name = username.trim();
    if (!name) return;
    if (checkingName) return;

    // Skip the availability check if the user kept their existing name.
    const isOwnName = !!user?.displayName && user.displayName.trim().toLowerCase() === name.toLowerCase();
    if (!isOwnName) {
      setCheckingName(true);
      setNameError('');
      try {
        const res = await trpcClient.user.checkUsername.query({
          displayName: name,
          excludeUserId: user?.id,
        });
        if (!res.available) {
          setNameError(
            res.reason === 'too_short'
              ? 'That name is too short. Use at least 2 characters.'
              : 'That username is already taken. Try another.',
          );
          setCheckingName(false);
          return;
        }
      } catch (e) {
        // Network/backend error: block and let the user retry so a taken
        // username can never slip through on a failed check.
        console.warn('[ONBOARDING] username check failed:', e);
        setNameError("Couldn't check that username. Check your connection and try again.");
        setCheckingName(false);
        return;
      }
      setCheckingName(false);
    }

    try {
      if (user) {
        await updateProfile({ displayName: name });
        await persistCar();
      } else {
        await createLocalUser({
          displayName: name,
          carBrand: brand || undefined,
          carModel: model || undefined,
          carPicture: carPhoto || undefined,
        });
      }
    } catch (e) {
      console.warn('[ONBOARDING] save profile failed:', e);
    }
    goNext();
  }, [username, checkingName, user, updateProfile, persistCar, createLocalUser, brand, model, carPhoto, goNext]);

  const completeOnboarding = useCallback(async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    } catch (e) {
      console.warn('[ONBOARDING] Failed to save completion:', e);
    }
    if (user) {
      try {
        void syncImagesToBackend();
      } catch (e) {
        console.warn('[ONBOARDING] image sync failed:', e);
      }
    }
    try {
      const { tiktokTrackCompleteTutorial } = await import('@/lib/tiktok');
      void tiktokTrackCompleteTutorial();
    } catch (e) {
      console.warn('[ONBOARDING] tiktok CompleteTutorial failed:', e);
    }
    try {
      const { metaTrackCompleteTutorial } = await import('@/lib/meta');
      void metaTrackCompleteTutorial();
    } catch (e) {
      console.warn('[ONBOARDING] meta CompleteTutorial failed:', e);
    }
    router.replace('/(tabs)/track' as any);
  }, [user, syncImagesToBackend, router]);

  // Auto-advance the "setting up" loader.
  useEffect(() => {
    if (step !== 'setup') return;
    const t = setTimeout(() => {
      setStepIndex((i) => (STEPS[i] === 'setup' ? i + 1 : i));
    }, 2300);
    return () => clearTimeout(t);
  }, [step]);

  const speedLabel = getSpeedLabel();
  const unitTarget = settings.speedUnit === 'mph' ? 85 : 137;
  const unitMax = settings.speedUnit === 'mph' ? 160 : 260;

  const showProgress = stepIndex >= SETUP_START && stepIndex <= SETUP_END;
  const progress = (stepIndex - SETUP_START + 1) / SETUP_COUNT;

  const availableModels = useMemo(() => (brand ? getModelsForBrand(brand) : []), [brand]);
  const brandNames = useMemo(() => CAR_BRANDS.map((b) => b.name), []);

  /* --------------------------- Step renderers --------------------------- */

  const renderHero = () => (
    <Animated.View key="hero" entering={enterFade()} style={styles.centerContent}>
      <Speedometer target={settings.speedUnit === 'mph' ? 78 : 124} max={unitMax} unitLabel={speedLabel.toUpperCase()} />
      <Text style={styles.heroTitle}>Track Your Drives</Text>
      <Text style={styles.heroSub}>Auto-logged drives with routes, recaps, and detailed stats for every journey.</Text>
    </Animated.View>
  );

  const renderCrew = () => (
    <Animated.View key="crew" entering={enterFade()} style={styles.centerContent}>
      <View style={styles.crewCard}>
        <View style={styles.crewHeader}>
          <View>
            <Text style={styles.crewKicker}>CREW</Text>
            <Text style={styles.crewTitle}>Sunday Drivers</Text>
          </View>
          <View style={styles.crewIcon}>
            <Users size={18} color={TEXT} />
          </View>
        </View>
        {CREW.map((c, i) => (
          <CrewRow key={c.name} item={c} unit={speedLabel} delay={150 + i * 120} />
        ))}
        <View style={styles.inviteRow}>
          <View style={styles.inviteHash}>
            <Hash size={13} color={TEXT} />
          </View>
          <Text style={styles.inviteCode}>RDL-7421</Text>
          <Text style={styles.inviteLabel}>INVITE CODE</Text>
        </View>
      </View>
      <Text style={styles.heroTitle}>Race Your Friends</Text>
      <Text style={styles.heroSub}>Create a private crew, share an invite code, and battle friends across top speed, distance and trips.</Text>
    </Animated.View>
  );

  const renderSignin = () => (
    <Animated.View key="signin" entering={enterFade()} style={styles.centerContent}>
      <View style={styles.iconBadgeLg}>
        <Trophy size={42} color={RED} />
      </View>
      <Text style={styles.heroTitle}>Join RedLine</Text>
      <Text style={styles.heroSub}>Sign in to save your drives, climb the leaderboard, and sync across devices.</Text>
      <View style={styles.authButtons}>
        {Platform.OS === 'ios' && isAppleAvailable && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={14}
            style={styles.appleButton}
            onPress={handleApple}
          />
        )}
        <TouchableOpacity
          style={[styles.googleButton, (authBusy || !request) && styles.btnDisabled]}
          onPress={handleGoogle}
          disabled={authBusy || !request}
          activeOpacity={0.85}
        >
          {authBusy ? (
            <ActivityIndicator color="#000000" />
          ) : (
            <>
              <View style={styles.googleG}>
                <Text style={styles.googleGText}>G</Text>
              </View>
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.emailButton, authBusy && styles.btnDisabled]}
          onPress={() => {
            haptic(Haptics.ImpactFeedbackStyle.Light);
            setEmailMode('signup');
            setShowEmailAuth(true);
          }}
          disabled={authBusy}
          activeOpacity={0.85}
        >
          <Mail size={20} color={TEXT} />
          <Text style={styles.emailButtonText}>Continue with email</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={() => goTo(STEPS.indexOf('unit'))} style={styles.laterLink} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={styles.laterLinkText}>Maybe later</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  const renderSignedIn = () => {
    const providerLabel = user?.authProvider === 'apple' ? 'Apple ID connected' : user?.authProvider === 'google' ? 'Google account connected' : 'Ready to track';
    const tiles = [
      { label: 'TOP SPEED', value: '—', accent: true },
      { label: 'TRIPS', value: '—', accent: false },
      { label: 'DISTANCE', value: '—', accent: false },
      { label: 'DRIVE SCORE', value: '—', accent: true },
    ];
    return (
      <Animated.View key="signedin" entering={enterFade()} style={styles.centerContent}>
        <View style={styles.statsGrid}>
          {tiles.map((t) => (
            <View key={t.label} style={[styles.statTile, t.accent && styles.statTileAccent]}>
              <Text style={[styles.statValue, t.accent && { color: RED }]}>{t.value}</Text>
              <Text style={styles.statLabel}>{t.label}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.heroTitle}>{user ? "You're signed in" : "You're all set"}</Text>
        <Text style={styles.heroSub}>
          {user
            ? `Welcome${user.displayName ? `, ${user.displayName}` : ''}. Your stats and trips will sync to your account.`
            : 'Start driving and your top speed, trips, distance and drive score will appear here.'}
        </Text>
        {user && (
          <View style={styles.connectedPill}>
            <View style={styles.connectedCheck}>
              <Check size={12} color="#000000" strokeWidth={3} />
            </View>
            <Text style={styles.connectedText}>{providerLabel}</Text>
          </View>
        )}
        <Text style={styles.statsCaption}>Start driving to fill these in.</Text>
      </Animated.View>
    );
  };

  const renderUnit = () => (
    <Animated.View key="unit" entering={enterFade()} style={styles.centerContent}>
      <Speedometer target={unitTarget} max={unitMax} unitLabel={speedLabel.toUpperCase()} />
      <Text style={styles.heroTitle}>Choose Your Unit</Text>
      <Text style={styles.heroSub}>Select your preferred speed unit for the speedometer and trip tracking.</Text>
      <View style={styles.unitToggle}>
        {(['kmh', 'mph'] as SpeedUnit[]).map((u) => {
          const active = settings.speedUnit === u;
          return (
            <TouchableOpacity
              key={u}
              style={[styles.unitOption, active && styles.unitOptionActive]}
              activeOpacity={0.85}
              onPress={() => {
                haptic(Haptics.ImpactFeedbackStyle.Light);
                setSpeedUnit(u);
              }}
            >
              <Text style={[styles.unitOptionText, active && styles.unitOptionTextActive]}>
                {u === 'kmh' ? 'km/h' : 'mph'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </Animated.View>
  );

  const renderRide = () => (
    <Animated.View key="ride" entering={enterFade()} style={styles.topContent}>
      <Text style={styles.setupTitle}>Choose your main ride</Text>
      <Text style={styles.setupSub}>Select the vehicle you drive the most.</Text>
      <View style={styles.brandBadge}>
        <View style={styles.brandBadgeInner}>
          {brand ? (
            <>
              <BrandLogo name={brand} size={72} fallbackIconSize={48} />
              <Text style={styles.brandBadgeText} numberOfLines={1}>{brand}</Text>
            </>
          ) : (
            <Car size={48} color={TEXT_DIM} />
          )}
        </View>
      </View>
      <TouchableOpacity
        style={styles.selectField}
        activeOpacity={0.85}
        onPress={() => {
          haptic(Haptics.ImpactFeedbackStyle.Light);
          setShowBrandPicker(true);
        }}
      >
        <Text style={[styles.selectText, !brand && styles.selectPlaceholder]}>{brand || 'Select brand'}</Text>
        <ChevronDown size={20} color={TEXT_DIM} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.selectField, !brand && styles.btnDisabled]}
        activeOpacity={0.85}
        disabled={!brand}
        onPress={() => {
          haptic(Haptics.ImpactFeedbackStyle.Light);
          setShowModelPicker(true);
        }}
      >
        <Text style={[styles.selectText, !model && styles.selectPlaceholder]}>{model || 'Select model'}</Text>
        <ChevronDown size={20} color={TEXT_DIM} />
      </TouchableOpacity>
    </Animated.View>
  );

  const renderPhoto = () => (
    <Animated.View key="photo" entering={enterFade()} style={styles.centerContent}>
      <Text style={styles.setupTitle}>Add a photo of your car</Text>
      <Text style={styles.setupSub}>Use a picture of your ride in your local garage.</Text>
      <TouchableOpacity style={styles.photoCircle} activeOpacity={0.85} onPress={pickPhoto}>
        {carPhoto ? (
          <AImage
            entering={enterFadePlain()}
            source={{ uri: carPhoto }}
            style={styles.photoImage}
          />
        ) : (
          <>
            <Car size={56} color={TEXT_DIM} />
            <Text style={styles.photoCarName}>{brand && model ? `${brand} ${model}` : 'Your car'}</Text>
          </>
        )}
      </TouchableOpacity>
    </Animated.View>
  );

  const renderRating = () => (
    <Animated.View key="rating" entering={enterFade()} style={styles.centerContent}>
      <StarRating onRate={() => void requestAppRating()} />
      <Text style={[styles.heroTitle, { marginTop: 36 }]}>Support our journey</Text>
      <Text style={styles.heroSub}>We&apos;re a small team building for drivers. A quick rating helps more drivers find RedLine.</Text>
      <View style={styles.benefitList}>
        {[
          { icon: Heart, text: 'Helps us keep building new features' },
          { icon: Sparkles, text: 'Takes less than 10 seconds' },
          { icon: Users, text: 'Joins thousands of happy drivers' },
        ].map((b) => {
          const Icon = b.icon;
          return (
            <View key={b.text} style={styles.benefitRow}>
              <View style={styles.benefitIcon}>
                <Icon size={15} color={RED} />
              </View>
              <Text style={styles.benefitText}>{b.text}</Text>
            </View>
          );
        })}
      </View>
    </Animated.View>
  );

  const renderName = () => (
    <Animated.View key="name" entering={enterFade()} style={styles.topContent}>
      <Text style={[styles.setupTitle, { marginTop: 40 }]}>Choose your driver name</Text>
      <Text style={styles.setupSub}>Pick a handle that personalizes your garage and stats.</Text>
      <View style={styles.usernameField}>
        <Text style={styles.usernameAt}>@</Text>
        <TextInput
          style={styles.usernameInput}
          placeholder="username"
          placeholderTextColor="#B0B0B5"
          value={username}
          onChangeText={(t) => {
            setUsername(t);
            if (nameError) setNameError('');
          }}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={24}
          returnKeyType="done"
          onSubmitEditing={handleNameContinue}
        />
      </View>
      {checkingName ? (
        <View style={styles.nameStatusRow}>
          <ActivityIndicator size="small" color={RED} />
          <Text style={styles.nameStatusText}>Checking availability…</Text>
        </View>
      ) : nameError ? (
        <Text style={styles.nameErrorText}>{nameError}</Text>
      ) : null}
    </Animated.View>
  );

  const renderLocation = () => (
    <Animated.View key="location" entering={enterFade()} style={styles.centerContent}>
      <View style={styles.locIcon}>
        <Navigation size={42} color={RED} fill={RED} />
      </View>
      <Text style={styles.heroTitle}>Location Access</Text>
      <Text style={styles.heroSub}>
        RedLine uses your location to measure your speed, record trips, and keep tracking while your device is locked.
      </Text>
      {locationGranted ? (
        <View style={styles.connectedPill}>
          <View style={styles.connectedCheck}>
            <Check size={12} color="#000000" strokeWidth={3} />
          </View>
          <Text style={styles.connectedText}>Location enabled</Text>
        </View>
      ) : (
        <TouchableOpacity style={styles.secondaryBtn} onPress={requestLocation} activeOpacity={0.85}>
          <Text style={styles.secondaryBtnText}>Enable location</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );

  const renderSafety = () => (
    <Animated.View key="safety" entering={enterFade()} style={styles.topContent}>
      <View style={[styles.iconBadgeSm, { alignSelf: 'center' }]}>
        <AlertTriangle size={26} color={RED} />
      </View>
      <Text style={[styles.setupTitle, { textAlign: 'center', marginTop: 16 }]}>Before you drive</Text>
      <Text style={[styles.setupSub, { textAlign: 'center' }]}>Important reminders to stay safe.</Text>
      <View style={styles.safetyCard}>
        {[
          { icon: Hand, text: 'Obey local traffic laws and speed limits. Never drive recklessly.' },
          { icon: Car, text: 'Start and stop recording only while safely parked.' },
          { icon: Smartphone, text: 'Use a phone holder, just like with any navigation app.' },
          { icon: Eye, text: 'Never touch your phone while driving. Eyes on the road.' },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <View key={s.text} style={styles.safetyRow}>
              <View style={styles.safetyIcon}>
                <Icon size={16} color={RED} />
              </View>
              <Text style={styles.safetyText}>{s.text}</Text>
            </View>
          );
        })}
      </View>
      <TouchableOpacity
        style={styles.checkRow}
        activeOpacity={0.8}
        onPress={() => {
          haptic(Haptics.ImpactFeedbackStyle.Light);
          setAckSafety((v) => !v);
        }}
      >
        <View style={[styles.checkbox, ackSafety && styles.checkboxOn]}>
          {ackSafety && <Check size={14} color="#000000" strokeWidth={3} />}
        </View>
        <Text style={styles.checkText}>I acknowledge these guidelines and agree to drive responsibly</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.checkRow}
        activeOpacity={0.8}
        onPress={() => {
          haptic(Haptics.ImpactFeedbackStyle.Light);
          setAckTerms((v) => !v);
        }}
      >
        <View style={[styles.checkbox, ackTerms && styles.checkboxOn]}>
          {ackTerms && <Check size={14} color="#000000" strokeWidth={3} />}
        </View>
        <Text style={styles.checkText}>
          I have read and accept the{' '}
          <Text style={styles.linkInline} onPress={() => void Linking.openURL('https://redlineapp.io/terms')}>
            Terms of Use
          </Text>{' '}
          and{' '}
          <Text style={styles.linkInline} onPress={() => void Linking.openURL('https://redlineapp.io/privacy')}>
            Privacy Policy
          </Text>
          .
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );

  const renderSetup = () => (
    <Animated.View key="setup" entering={enterFade()} style={styles.centerContent}>
      <SetupLoader />
      <Text style={[styles.heroTitle, { marginTop: 28 }]}>We&apos;re setting everything up</Text>
      <Text style={styles.heroSub}>Calibrating units, vehicle profile, and live tracking.</Text>
    </Animated.View>
  );

  const renderSocial = () => (
    <Animated.View key="social" entering={enterFade()} style={{ flex: 1, width: '100%' }}>
      <Text style={[styles.setupTitle, { textAlign: 'center', marginTop: 8 }]}>Loved by drivers</Text>
      <ScrollView style={{ flex: 1, marginTop: 16 }} showsVerticalScrollIndicator={false}>
        {[
          { name: 'Tyler M.', handle: '@tyler_rs6', title: 'Made for real drivers', body: 'This app actually feels like it was made by someone who really drives. The stats are clean and exactly what I was looking for.' },
          { name: 'Brandon K.', handle: '@brandon.drives', title: 'Perfect for car lovers', body: 'Amazing app. If you are a car lover you have found the perfect app. I genuinely have way more fun driving now.' },
          { name: 'Jules R.', handle: '@jules.gt3', title: 'Competing with friends is addictive', body: 'My favorite feature is seeing my friends stats and competing with them. I am literally using this every day.' },
        ].map((t) => (
          <View key={t.handle} style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
              <View style={styles.reviewAvatar}>
                <Text style={styles.reviewAvatarText}>{t.name.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.reviewName}>{t.name}</Text>
                <Text style={styles.reviewHandle}>{t.handle}</Text>
              </View>
              <View style={styles.reviewStars}>
                {[0, 1, 2, 3, 4].map((s) => (
                  <Star key={s} size={12} color={RED} fill={RED} />
                ))}
              </View>
            </View>
            <Text style={styles.reviewTitle}>{t.title}</Text>
            <Text style={styles.reviewBody}>{t.body}</Text>
          </View>
        ))}
      </ScrollView>
    </Animated.View>
  );

  const renderStepContent = () => {
    switch (step) {
      case 'hero':
        return renderHero();
      case 'crew':
        return renderCrew();
      case 'signin':
        return renderSignin();
      case 'signedin':
        return renderSignedIn();
      case 'unit':
        return renderUnit();
      case 'ride':
        return renderRide();
      case 'photo':
        return renderPhoto();
      case 'rating':
        return renderRating();
      case 'name':
        return renderName();
      case 'location':
        return renderLocation();
      case 'safety':
        return renderSafety();
      case 'setup':
        return renderSetup();
      case 'social':
        return renderSocial();
      default:
        return null;
    }
  };

  /* ------------------------------ Footer ------------------------------ */

  const renderFooter = () => {
    if (step === 'signin' || step === 'setup') return null;

    let label = 'Continue';
    let onPress: () => void = goNext;
    let disabled = false;
    let secondary: { label: string; onPress: () => void } | null = null;

    switch (step) {
      case 'hero':
      case 'crew':
        label = 'Next';
        break;
      case 'ride':
        disabled = !brand || !model;
        onPress = handleRideContinue;
        break;
      case 'photo':
        label = carPhoto ? 'Continue' : 'Add a Photo';
        onPress = carPhoto ? handlePhotoContinue : pickPhoto;
        secondary = { label: 'Skip', onPress: handlePhotoContinue };
        break;
      case 'rating':
        onPress = goNext;
        break;
      case 'name':
        disabled = !username.trim() || checkingName;
        onPress = handleNameContinue;
        break;
      case 'safety':
        label = 'I Agree & Continue';
        disabled = !ackSafety || !ackTerms;
        break;
      case 'social':
        label = 'Continue';
        break;
      default:
        break;
    }

    return (
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.primaryBtn, disabled && styles.btnDisabled]}
          activeOpacity={0.9}
          disabled={disabled}
          onPress={onPress}
          testID="onboarding-next"
        >
          <Text style={styles.primaryBtnText}>{label}</Text>
          <ChevronRight size={20} color="#FFFFFF" />
        </TouchableOpacity>
        {secondary && (
          <TouchableOpacity style={styles.skipBtn} activeOpacity={0.7} onPress={secondary.onPress}>
            <Text style={styles.skipBtnText}>{secondary.label}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (step === 'paywall') {
    return (
      <View style={styles.container}>
        <OnboardPaywallPage
          width={SCREEN_WIDTH}
          topInset={insets.top}
          bottomInset={insets.bottom}
          onContinue={() => void completeOnboarding()}
          ctaLabel={undefined}
          skipLabel="Maybe later"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.topArea, { paddingTop: insets.top + 16 }]}>
        {showProgress && <ProgressBar progress={progress} />}
      </View>

      <View style={styles.body}>{renderStepContent()}</View>

      {renderFooter()}

      <PickerModal
        visible={showBrandPicker}
        title="Select brand"
        data={brandNames}
        renderLeading={(item) => <BrandLogo name={item} size={26} fallbackIconSize={18} />}
        onClose={() => setShowBrandPicker(false)}
        onSelect={(value) => {
          setBrand(value);
          setModel('');
          setShowBrandPicker(false);
        }}
      />
      <PickerModal
        visible={showModelPicker}
        title="Select model"
        data={availableModels}
        onClose={() => setShowModelPicker(false)}
        onSelect={(value) => {
          setModel(value);
          setShowModelPicker(false);
        }}
      />
      <Modal visible={showEmailAuth} transparent animationType="slide" onRequestClose={() => setShowEmailAuth(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <TouchableOpacity style={styles.modalBackdropFill} activeOpacity={1} onPress={() => setShowEmailAuth(false)} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {emailMode === 'signup' ? 'Create account' : 'Sign in'}
              </Text>
              <TouchableOpacity onPress={() => setShowEmailAuth(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={22} color={TEXT_DIM} />
              </TouchableOpacity>
            </View>

            {emailMode === 'signup' && (
              <View style={styles.emailField}>
                <Trophy size={18} color={TEXT_DIM} />
                <TextInput
                  style={styles.emailInput}
                  placeholder="Display name (optional)"
                  placeholderTextColor={TEXT_DIM}
                  value={emailName}
                  onChangeText={setEmailName}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
            )}
            <View style={styles.emailField}>
              <Mail size={18} color={TEXT_DIM} />
              <TextInput
                style={styles.emailInput}
                placeholder="Email"
                placeholderTextColor={TEXT_DIM}
                value={emailValue}
                onChangeText={setEmailValue}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>
            <View style={styles.emailField}>
              <Lock size={18} color={TEXT_DIM} />
              <TextInput
                style={styles.emailInput}
                placeholder="Password"
                placeholderTextColor={TEXT_DIM}
                value={passwordValue}
                onChangeText={setPasswordValue}
                secureTextEntry
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={handleEmailAuth}
              />
            </View>

            <TouchableOpacity
              style={[styles.emailSubmit, authBusy && styles.btnDisabled]}
              onPress={handleEmailAuth}
              disabled={authBusy}
              activeOpacity={0.85}
            >
              {authBusy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.emailSubmitText}>
                  {emailMode === 'signup' ? 'Create account' : 'Sign in'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.emailSwitch}
              onPress={() => setEmailMode((m) => (m === 'signup' ? 'signin' : 'signup'))}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.emailSwitchText}>
                {emailMode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
                <Text style={styles.emailSwitchLink}>
                  {emailMode === 'signup' ? 'Sign in' : 'Create one'}
                </Text>
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  topArea: {
    paddingHorizontal: 24,
    minHeight: 8,
  },
  body: {
    flex: 1,
    paddingHorizontal: 24,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topContent: {
    flex: 1,
    alignItems: 'center',
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 8,
    gap: 12,
  },

  // Progress
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: TRACK,
    overflow: 'hidden',
    width: '100%',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: RED,
  },

  // Speedometer
  gaugeOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0A0A0A',
  },
  speedoCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedoNumber: {
    fontFamily: FONT_BOLD,
    fontSize: 66,
    color: TEXT,
    padding: 0,
    minWidth: 140,
    textAlign: 'center',
  },
  speedoUnit: {
    fontFamily: FONT_SEMI,
    fontSize: 15,
    color: TEXT_DIM,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 2,
  },

  // Hero text
  heroTitle: {
    fontFamily: FONT_XBOLD,
    fontSize: 28,
    color: TEXT,
    textAlign: 'center',
    marginTop: 40,
    letterSpacing: 0.5,
  },
  heroSub: {
    fontSize: 15,
    color: TEXT_DIM,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 14,
    maxWidth: 320,
  },

  // Icon badges
  iconBadgeLg: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: RED_SOFT,
    borderWidth: 1,
    borderColor: RED_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadgeSm: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: RED_SOFT,
    borderWidth: 1,
    borderColor: RED_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Crew card
  crewCard: {
    width: '100%',
    backgroundColor: CARD,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  crewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  crewKicker: {
    fontFamily: FONT_BOLD,
    fontSize: 11,
    color: RED,
    letterSpacing: 3,
  },
  crewTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 18,
    color: TEXT,
    marginTop: 2,
  },
  crewIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: CARD_LIGHT,
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  crewRowYou: {
    borderColor: RED_BORDER,
    backgroundColor: 'rgba(204,0,0,0.06)',
  },
  crewRank: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crewRankText: {
    fontFamily: FONT_BOLD,
    fontSize: 12,
    color: '#000000',
  },
  crewAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#3A3A3C',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#48484A',
  },
  crewAvatarText: {
    fontFamily: FONT_BOLD,
    fontSize: 15,
    color: TEXT,
  },
  crewNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  crewName: {
    fontFamily: FONT_SEMI,
    fontSize: 14,
    color: TEXT,
  },
  crewSub: {
    fontSize: 11,
    color: TEXT_DIM,
    marginTop: 1,
  },
  youBadge: {
    backgroundColor: RED,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  youBadgeText: {
    fontFamily: FONT_BOLD,
    fontSize: 9,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  crewValue: {
    fontFamily: FONT_BOLD,
    fontSize: 17,
    color: TEXT,
  },
  crewValueUnit: {
    fontFamily: FONT_SEMI,
    fontSize: 10,
    color: TEXT_DIM,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#161618',
    borderRadius: 12,
    padding: 12,
    marginTop: 2,
  },
  inviteHash: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteCode: {
    flex: 1,
    fontFamily: FONT_BOLD,
    fontSize: 14,
    color: TEXT,
    letterSpacing: 1,
  },
  inviteLabel: {
    fontSize: 10,
    color: TEXT_DIM,
    letterSpacing: 1.5,
  },

  // Auth
  authButtons: {
    width: '100%',
    gap: 12,
    marginTop: 36,
  },
  appleButton: {
    width: '100%',
    height: 54,
  },
  googleButton: {
    width: '100%',
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
  },
  googleG: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleGText: {
    fontFamily: FONT_BOLD,
    fontSize: 13,
    color: '#FFFFFF',
  },
  googleButtonText: {
    fontFamily: FONT_BOLD,
    fontSize: 16,
    color: '#000000',
  },
  emailButton: {
    width: '100%',
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_LIGHT,
    borderRadius: 14,
  },
  emailButtonText: {
    fontFamily: FONT_BOLD,
    fontSize: 16,
    color: TEXT,
  },
  emailField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_LIGHT,
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  emailInput: {
    flex: 1,
    fontFamily: FONT_SEMI,
    fontSize: 16,
    color: TEXT,
    paddingVertical: 15,
  },
  emailSubmit: {
    width: '100%',
    height: 54,
    backgroundColor: RED,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  emailSubmitText: {
    fontFamily: FONT_BOLD,
    fontSize: 16,
    color: '#FFFFFF',
  },
  emailSwitch: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 4,
  },
  emailSwitchText: {
    color: TEXT_DIM,
    fontSize: 14,
  },
  emailSwitchLink: {
    color: RED,
    fontFamily: FONT_BOLD,
  },
  modalBackdropFill: {
    flex: 1,
  },
  laterLink: {
    marginTop: 22,
    paddingVertical: 8,
  },
  laterLinkText: {
    color: TEXT_DIM,
    fontSize: 14,
    fontWeight: '500',
  },

  // Signed-in stats
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    width: '100%',
  },
  statTile: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  statTileAccent: {
    borderColor: RED_BORDER,
  },
  statValue: {
    fontFamily: FONT_XBOLD,
    fontSize: 26,
    color: TEXT,
  },
  statLabel: {
    fontSize: 11,
    color: TEXT_DIM,
    letterSpacing: 1,
    marginTop: 4,
  },
  statsCaption: {
    fontSize: 12,
    color: TEXT_DIM,
    marginTop: 16,
  },
  connectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: RED_BORDER,
    backgroundColor: 'rgba(204,0,0,0.06)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 22,
  },
  connectedCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectedText: {
    fontFamily: FONT_SEMI,
    fontSize: 14,
    color: TEXT,
  },

  // Unit toggle
  unitToggle: {
    flexDirection: 'row',
    backgroundColor: CARD,
    borderRadius: 30,
    padding: 5,
    marginTop: 32,
    width: 260,
  },
  unitOption: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
  },
  unitOptionActive: {
    backgroundColor: RED,
  },
  unitOptionText: {
    fontFamily: FONT_BOLD,
    fontSize: 16,
    color: TEXT_DIM,
  },
  unitOptionTextActive: {
    color: '#FFFFFF',
  },

  // Setup title (left/top aligned screens)
  setupTitle: {
    fontFamily: FONT_XBOLD,
    fontSize: 26,
    color: TEXT,
    textAlign: 'center',
    marginTop: 12,
    letterSpacing: 0.3,
  },
  setupSub: {
    fontSize: 14,
    color: TEXT_DIM,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 10,
    maxWidth: 320,
  },

  // Ride
  brandBadge: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 2,
    borderColor: RED_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 36,
    marginBottom: 8,
  },
  brandBadgeInner: {
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    gap: 6,
  },
  brandBadgeText: {
    fontFamily: FONT_BOLD,
    fontSize: 13,
    color: '#000000',
    textAlign: 'center',
  },
  selectField: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CARD,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 18,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  selectText: {
    fontFamily: FONT_SEMI,
    fontSize: 16,
    color: TEXT,
  },
  selectPlaceholder: {
    color: TEXT_DIM,
    fontFamily: undefined,
    fontWeight: '500',
  },

  // Photo
  photoCircle: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 2,
    borderColor: RED_BORDER,
    backgroundColor: CARD,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
    overflow: 'hidden',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoCarName: {
    fontSize: 13,
    color: TEXT_DIM,
    marginTop: 12,
  },

  // Rating
  starsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  benefitList: {
    width: '100%',
    gap: 10,
    marginTop: 28,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: CARD,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  benefitIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: RED_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: {
    flex: 1,
    fontSize: 14,
    color: TEXT,
    fontWeight: '500',
  },

  // Username
  usernameField: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 18,
    marginTop: 36,
  },
  usernameAt: {
    fontFamily: FONT_BOLD,
    fontSize: 20,
    color: RED,
    marginRight: 6,
  },
  usernameInput: {
    flex: 1,
    fontFamily: FONT_SEMI,
    fontSize: 18,
    color: '#000000',
    paddingVertical: 18,
  },
  nameStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  nameStatusText: {
    fontFamily: FONT_SEMI,
    fontSize: 13,
    color: '#B0B0B5',
  },
  nameErrorText: {
    fontFamily: FONT_SEMI,
    fontSize: 13,
    color: RED,
    marginTop: 14,
  },

  // Location
  locIcon: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: RED_SOFT,
    borderWidth: 1,
    borderColor: RED_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: RED,
    backgroundColor: 'rgba(204,0,0,0.08)',
  },
  secondaryBtnText: {
    fontFamily: FONT_BOLD,
    fontSize: 15,
    color: RED,
  },

  // Safety
  safetyCard: {
    width: '100%',
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 14,
    gap: 12,
    marginTop: 22,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  safetyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  safetyIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: RED_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safetyText: {
    flex: 1,
    fontSize: 13,
    color: '#D0D0D2',
    lineHeight: 18,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 16,
    width: '100%',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#48484A',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: {
    backgroundColor: RED,
    borderColor: RED,
  },
  checkText: {
    flex: 1,
    fontSize: 13,
    color: TEXT,
    lineHeight: 19,
    fontWeight: '500',
  },
  linkInline: {
    color: RED,
    textDecorationLine: 'underline',
  },

  // Setup loader
  loaderWrap: {
    width: 110,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(204,0,0,0.12)',
  },
  loaderRing: {
    position: 'absolute',
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 5,
    borderColor: 'rgba(204,0,0,0.18)',
    borderTopColor: RED,
  },
  loaderCore: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: CARD,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: RED_BORDER,
  },

  // Social proof
  reviewCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  reviewAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: RED_SOFT,
    borderWidth: 1,
    borderColor: RED_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewAvatarText: {
    fontFamily: FONT_BOLD,
    fontSize: 16,
    color: TEXT,
  },
  reviewName: {
    fontFamily: FONT_SEMI,
    fontSize: 14,
    color: TEXT,
  },
  reviewHandle: {
    fontSize: 12,
    color: TEXT_DIM,
    marginTop: 1,
  },
  reviewStars: {
    flexDirection: 'row',
    gap: 2,
  },
  reviewTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 15,
    color: TEXT,
    marginBottom: 6,
  },
  reviewBody: {
    fontSize: 13,
    color: TEXT_DIM,
    lineHeight: 19,
  },

  // Buttons
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: RED,
    paddingVertical: 17,
    borderRadius: 16,
    gap: 8,
    shadowColor: RED,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  primaryBtnText: {
    fontFamily: FONT_BOLD,
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  skipBtnText: {
    color: TEXT_DIM,
    fontSize: 15,
    fontWeight: '600',
  },

  // Picker modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#141416',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 18,
    color: TEXT,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: CARD,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: TEXT,
    fontSize: 15,
    paddingVertical: 12,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2C2C2E',
  },
  pickerRowText: {
    flex: 1,
    fontSize: 15,
    color: TEXT,
  },
  pickerRowLeading: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    padding: 4,
  },
  pickerEmpty: {
    textAlign: 'center',
    color: TEXT_DIM,
    paddingVertical: 30,
  },
});
