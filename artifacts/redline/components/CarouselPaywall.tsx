import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
  Linking,
} from "react-native";
import {
  X,
  Check,
  Sparkles,
  Trophy,
  Infinity as InfinityIcon,
  Bell,
  Share2,
  Flag,
  Music,
  ChevronRight,
} from "lucide-react-native";
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import type { PaywallResult } from "@/components/CustomPaywallModal";

const RED = "#E10600";
const AUTOPLAY_MS = 4200;

interface CarouselPaywallProps {
  visible: boolean;
  monthlyPackage: any | null;
  yearlyPackage: any | null;
  onClose: (result: PaywallResult) => void;
  onPurchase: (pkg: any) => Promise<any>;
  onRestore: () => Promise<any>;
  verifyEntitlement?: () => Promise<boolean>;
}

function formatPrice(price: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    return `$${price.toFixed(2)}`;
  }
}

type Slide = {
  key: string;
  title: string;
  lines: string[];
  icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  visual: React.ComponentType;
};

/* ————————————————— Slide visuals ————————————————— */

function SpeedoVisual() {
  const r = 86;
  const c = 2 * Math.PI * r; // ≈ 540
  return (
    <View style={vs.center}>
      <View style={{ width: 220, height: 220 }}>
        <Svg width={220} height={220} viewBox="0 0 200 200">
          <Defs>
            <SvgLinearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={RED} stopOpacity="0.9" />
              <Stop offset="1" stopColor={RED} stopOpacity="0.1" />
            </SvgLinearGradient>
          </Defs>
          <Circle cx="100" cy="100" r={r} stroke="rgba(255,255,255,0.06)" strokeWidth="10" fill="none" />
          <Circle
            cx="100"
            cy="100"
            r={r}
            stroke="url(#ring)"
            strokeWidth="10"
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${c}`}
            strokeDashoffset="140"
            transform="rotate(-90 100 100)"
          />
          <Circle cx="171" cy="130" r="4" fill={RED} />
        </Svg>
        <View style={[StyleSheet.absoluteFill, vs.center]}>
          <Text style={vs.speedoValue}>142</Text>
          <Text style={vs.speedoUnit}>KM/H</Text>
        </View>
      </View>
    </View>
  );
}

function LeaderboardVisual() {
  const rows = [
    { n: "marco.rs", v: "198", m: "🥇", top: true },
    { n: "jake.m", v: "185", m: "🥈", top: false },
    { n: "luka.a6", v: "172", m: "🥉", top: false },
  ];
  return (
    <View style={[vs.fill, { justifyContent: "center", paddingHorizontal: 20, gap: 8 }]}>
      {rows.map((r) => (
        <View key={r.n} style={[vs.lbRow, r.top && vs.lbRowTop]}>
          <Text style={{ fontSize: 20 }}>{r.m}</Text>
          <View style={{ flex: 1 }}>
            <Text style={vs.lbName}>{r.n}</Text>
            <Text style={vs.dimSmall}>Friend</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={vs.lbValue}>{r.v}</Text>
            <Text style={vs.dimTiny}>km/h</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function RecordingsVisual() {
  return (
    <View style={vs.center}>
      <InfinityIcon color={RED} size={150} strokeWidth={1.2} />
      <Text style={[vs.trackingCaps, { marginTop: 14 }]}>UNLIMITED SESSIONS</Text>
    </View>
  );
}

function AlertsVisual() {
  return (
    <View style={[vs.center, { gap: 16 }]}>
      <View style={vs.bellCircle}>
        <Bell color="#FFFFFF" size={34} strokeWidth={2.2} />
      </View>
      <View style={vs.glassPill}>
        <Text style={vs.alertLabel}>RECORD BROKEN</Text>
        <Text style={vs.alertText}>jake.m just beat your top speed</Text>
      </View>
    </View>
  );
}

function InvitesVisual() {
  const bubbles = [
    { me: false, t: "Join my Redline board 🏁" },
    { me: true, t: "On it. Let's go." },
    { me: false, t: "🔥🔥🔥" },
  ];
  return (
    <View style={[vs.fill, { justifyContent: "center", paddingHorizontal: 24, gap: 8 }]}>
      {bubbles.map((b, i) => (
        <View key={i} style={{ flexDirection: "row", justifyContent: b.me ? "flex-end" : "flex-start" }}>
          <View style={[vs.bubble, b.me ? vs.bubbleMe : vs.bubbleThem]}>
            <Text style={[vs.bubbleText, b.me && { color: "#FFFFFF" }]}>{b.t}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function ChallengesVisual() {
  return (
    <View style={[vs.center, { gap: 12 }]}>
      <View style={vs.challengePill}>
        <Flag color={RED} size={13} />
        <Text style={vs.challengePillText}>ACTIVE CHALLENGE</Text>
      </View>
      <View style={vs.prizeCard}>
        <Text style={vs.dimCaps}>PRIZE POOL</Text>
        <Text style={vs.prizeValue}>$250</Text>
        <View style={vs.countdownRow}>
          <TimeBlock v="02" l="D" />
          <Text style={vs.colonText}>:</Text>
          <TimeBlock v="14" l="H" />
          <Text style={vs.colonText}>:</Text>
          <TimeBlock v="37" l="M" />
        </View>
      </View>
    </View>
  );
}

function TimeBlock({ v, l }: { v: string; l: string }) {
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={vs.timeValue}>{v}</Text>
      <Text style={vs.timeLabel}>{l}</Text>
    </View>
  );
}

const SOUND_BARS = [30, 60, 45, 80, 55, 90, 40, 70, 50, 85, 35, 65, 50, 78, 42];

function SoundtrackVisual() {
  return (
    <View style={[vs.center, { gap: 18, paddingHorizontal: 24 }]}>
      <View style={vs.barsRow}>
        {SOUND_BARS.map((h, i) => (
          <LinearGradient
            key={i}
            colors={["rgba(225,6,0,0.4)", RED]}
            style={[vs.bar, { height: (h / 100) * 90 }]}
          />
        ))}
      </View>
      <View style={vs.trackCard}>
        <View style={vs.trackIconBubble}>
          <Music color={RED} size={16} />
        </View>
        <View>
          <Text style={vs.trackTitle}>Night Run</Text>
          <Text style={vs.dimSmall}>Attached to your recap</Text>
        </View>
      </View>
    </View>
  );
}

const SLIDES: Slide[] = [
  {
    key: "coach",
    title: "AI Drive Coach",
    lines: [
      "Personal insights on every drive",
      "Braking, cornering & acceleration tips",
      "Improve lap after lap, week after week",
    ],
    icon: Sparkles,
    visual: SpeedoVisual,
  },
  {
    key: "leaderboard",
    title: "Full Leaderboard Access",
    lines: [
      "Compete with friends & drivers worldwide",
      "Climb the global driving charts",
      "See how you rank against others",
    ],
    icon: Trophy,
    visual: LeaderboardVisual,
  },
  {
    key: "unlimited",
    title: "Unlimited Drive Recordings",
    lines: [
      "Record every trip. No caps. No limits.",
      "Full history saved to your garage",
      "Never lose a session again",
    ],
    icon: InfinityIcon,
    visual: RecordingsVisual,
  },
  {
    key: "alerts",
    title: "Friends Boards Leave Alerts",
    lines: [
      "Know the moment your record falls",
      "Instant push when a friend beats you",
      "React fast. Reclaim your spot.",
    ],
    icon: Bell,
    visual: AlertsVisual,
  },
  {
    key: "invites",
    title: "iOS Share-Sheet Invites",
    lines: [
      "Invite friends straight from iMessage",
      "One tap to join your private boards",
      "Native, fast, and beautifully integrated",
    ],
    icon: Share2,
    visual: InvitesVisual,
  },
  {
    key: "challenges",
    title: "Custom Challenges & Cash Rewards",
    lines: [
      "Create challenges with countdowns",
      "Real cash prizes for winners",
      "Turn every drive into a competition",
    ],
    icon: Flag,
    visual: ChallengesVisual,
  },
  {
    key: "soundtrack",
    title: "Drive Soundtracks",
    lines: [
      "Pair songs to your best drives",
      "Auto-attached to recaps and posts",
      "Relive every run with your music",
    ],
    icon: Music,
    visual: SoundtrackVisual,
  },
];

function SlideCard({ slide, width }: { slide: Slide; width: number }) {
  const Visual = slide.visual;
  const Icon = slide.icon;
  return (
    <View style={{ width, paddingHorizontal: 20 }}>
      <View style={styles.visualCard}>
        <LinearGradient
          colors={["rgba(225,6,0,0.15)", "rgba(225,6,0,0.0)"]}
          style={StyleSheet.absoluteFill}
        />
        <Visual />
      </View>
      <View style={styles.copyCard}>
        <View style={styles.copyHeader}>
          <View style={styles.copyIconBubble}>
            <Icon color={RED} size={16} strokeWidth={2.2} />
          </View>
          <Text style={styles.copyKicker}>REDLINE PRO</Text>
        </View>
        <Text style={styles.copyTitle}>{slide.title}</Text>
        <View style={{ marginTop: 12, gap: 7 }}>
          {slide.lines.map((l) => (
            <View key={l} style={styles.copyLineRow}>
              <View style={styles.copyDot} />
              <Text style={styles.copyLine}>{l}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/* ————————————————— Main component ————————————————— */

export default function CarouselPaywall({
  visible,
  monthlyPackage,
  yearlyPackage,
  onClose,
  onPurchase,
  onRestore,
  verifyEntitlement,
}: CarouselPaywallProps) {
  const { width } = useWindowDimensions();
  const [selected, setSelected] = useState<"monthly" | "yearly">("yearly");
  const [busy, setBusy] = useState(false);
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const indexRef = useRef(0);
  const pausedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setSelected("yearly");
      setBusy(false);
      setIndex(0);
      indexRef.current = 0;
      pausedRef.current = false;
      scrollRef.current?.scrollTo({ x: 0, animated: false });
    }
  }, [visible]);

  // Autoplay — pauses permanently on first user touch (matches web design)
  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => {
      if (pausedRef.current) return;
      const next = (indexRef.current + 1) % SLIDES.length;
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
      indexRef.current = next;
      setIndex(next);
    }, AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [visible, width]);

  const haptic = useCallback(() => {
    if (Platform.OS !== "web") {
      void Haptics.selectionAsync();
    }
  }, []);

  const onMomentumEnd = useCallback(
    (e: any) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / width);
      const clamped = Math.max(0, Math.min(SLIDES.length - 1, i));
      indexRef.current = clamped;
      setIndex(clamped);
    },
    [width]
  );

  const goTo = useCallback(
    (i: number) => {
      haptic();
      pausedRef.current = true;
      scrollRef.current?.scrollTo({ x: i * width, animated: true });
      indexRef.current = i;
      setIndex(i);
    },
    [width, haptic]
  );

  /* ——— pricing (identical math to CustomPaywallModal) ——— */
  const monthlyPrice = monthlyPackage?.product?.price ?? 0;
  const monthlyPriceString =
    monthlyPackage?.product?.priceString ?? (monthlyPrice ? `$${monthlyPrice.toFixed(2)}` : "");
  const monthlyCurrency = monthlyPackage?.product?.currencyCode ?? "USD";

  const yearlyPrice = yearlyPackage?.product?.price ?? 0;
  const yearlyPriceString =
    yearlyPackage?.product?.priceString ?? (yearlyPrice ? `$${yearlyPrice.toFixed(2)}` : "");
  const yearlyCurrency = yearlyPackage?.product?.currencyCode ?? monthlyCurrency;

  const comparePrice = monthlyPrice > 0 ? monthlyPrice * 12 : 0;
  const compareString = comparePrice > 0 ? formatPrice(comparePrice, yearlyCurrency) : "";
  const discountPercent =
    comparePrice > 0 && yearlyPrice > 0 && comparePrice > yearlyPrice
      ? Math.round((1 - yearlyPrice / comparePrice) * 100)
      : 0;

  const yearlyMonthlyEq = yearlyPrice > 0 ? yearlyPrice / 12 : 0;
  const yearlyMonthlyEqString =
    yearlyMonthlyEq > 0 ? formatPrice(yearlyMonthlyEq, yearlyCurrency) : "";

  const selectedPackage = selected === "monthly" ? monthlyPackage : yearlyPackage;
  const hasAnyPackage = !!monthlyPackage || !!yearlyPackage;

  /* ——— purchase / restore (identical flow to CustomPaywallModal) ——— */
  const handlePurchase = useCallback(async () => {
    if (!selectedPackage) {
      Alert.alert("Unavailable", "This plan is not available right now. Please try again in a moment.");
      return;
    }
    if (busy) return;
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setBusy(true);
    try {
      const customerInfo: any = await onPurchase(selectedPackage);
      const isActive =
        !!customerInfo?.entitlements?.active &&
        Object.keys(customerInfo.entitlements.active).length > 0;
      if (isActive) {
        onClose("purchased");
        return;
      }
      if (verifyEntitlement) {
        try {
          if (await verifyEntitlement()) {
            onClose("purchased");
            return;
          }
        } catch {}
      }
      onClose("purchased");
    } catch (err: any) {
      const message: string = err?.message ?? "Purchase failed. Please try again.";
      const code: string = String(err?.code ?? err?.userInfo?.readable_error_code ?? "");
      const userCancelled =
        err?.userCancelled === true ||
        code === "1" ||
        /PURCHASE_CANCELLED/i.test(code) ||
        /cancel/i.test(message);
      if (userCancelled) return;
      if (verifyEntitlement) {
        try {
          if (await verifyEntitlement()) {
            onClose("purchased");
            return;
          }
        } catch {}
      }
      Alert.alert("Purchase failed", message);
    } finally {
      setBusy(false);
    }
  }, [selectedPackage, onPurchase, onClose, busy, verifyEntitlement]);

  const handleRestore = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const customerInfo = await onRestore();
      const hasActive =
        !!customerInfo?.entitlements?.active &&
        Object.keys(customerInfo.entitlements.active).length > 0;
      if (hasActive) {
        Alert.alert("Restored", "Your previous subscription has been restored.");
        onClose("restored");
      } else {
        Alert.alert("Nothing to restore", "We couldn't find any previous purchases on this Apple ID.");
      }
    } catch (err: any) {
      Alert.alert("Restore failed", err?.message ?? "Please try again later.");
    } finally {
      setBusy(false);
    }
  }, [onRestore, onClose, busy]);

  const handleClose = useCallback(() => {
    if (busy) return;
    onClose("cancelled");
  }, [busy, onClose]);

  const yearlySelected = selected === "yearly";
  const monthlySelected = selected === "monthly";

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={handleClose}>
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Top bar */}
          <View style={styles.topBar}>
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>🏁 PRO</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={handleClose}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <X color="#000000" size={18} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          {/* Carousel */}
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onMomentumEnd}
            onScrollBeginDrag={() => {
              pausedRef.current = true;
            }}
            style={{ marginTop: 8 }}
          >
            {SLIDES.map((s) => (
              <SlideCard key={s.key} slide={s} width={width} />
            ))}
          </ScrollView>

          {/* Dots */}
          <View style={styles.dotsRow}>
            {SLIDES.map((_, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => goTo(i)}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              >
                <View style={[styles.dot, i === index && styles.dotActive]} />
              </TouchableOpacity>
            ))}
          </View>

          {/* Plans */}
          {!hasAnyPackage ? (
            <View style={styles.noPackagesCard}>
              <ActivityIndicator color={RED} />
              <Text style={styles.noPackagesText}>Loading plans…</Text>
            </View>
          ) : (
            <View style={styles.plansContainer}>
              {yearlyPackage && (
                <TouchableOpacity
                  style={[styles.planCard, yearlySelected && styles.planCardSelected]}
                  onPress={() => {
                    haptic();
                    setSelected("yearly");
                  }}
                  activeOpacity={0.85}
                >
                  {discountPercent > 0 && (
                    <View style={styles.saveBadge}>
                      <Text style={styles.saveBadgeText}>SAVE {discountPercent}%</Text>
                    </View>
                  )}
                  <View style={[styles.checkCircle, yearlySelected && styles.checkCircleSelected]}>
                    {yearlySelected && <Check color="#FFFFFF" size={14} strokeWidth={3} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.planTitle}>Annual</Text>
                    {yearlyMonthlyEqString ? (
                      <Text style={styles.planSubtitle}>
                        {yearlyMonthlyEqString} / mo · billed yearly
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    {compareString ? <Text style={styles.strikePrice}>{compareString}</Text> : null}
                    <Text style={styles.planPrice}>{yearlyPriceString}</Text>
                    <Text style={styles.planCadence}>per year</Text>
                  </View>
                </TouchableOpacity>
              )}

              {monthlyPackage && (
                <TouchableOpacity
                  style={[styles.planCard, monthlySelected && styles.planCardSelected]}
                  onPress={() => {
                    haptic();
                    setSelected("monthly");
                  }}
                  activeOpacity={0.85}
                >
                  <View style={[styles.checkCircle, monthlySelected && styles.checkCircleSelected]}>
                    {monthlySelected && <Check color="#FFFFFF" size={14} strokeWidth={3} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.planTitle}>Monthly</Text>
                    <Text style={styles.planSubtitle}>Cancel anytime</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.planPrice}>{monthlyPriceString}</Text>
                    <Text style={styles.planCadence}>per month</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* CTA */}
          <TouchableOpacity
            style={[styles.ctaBtn, (busy || !selectedPackage) && styles.ctaBtnDisabled]}
            onPress={handlePurchase}
            activeOpacity={0.85}
            disabled={busy || !selectedPackage}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.ctaText}>
                  {yearlySelected ? "START YEARLY" : "START MONTHLY"}
                </Text>
                <ChevronRight color="#FFFFFF" size={20} strokeWidth={2.5} />
              </>
            )}
          </TouchableOpacity>

          {/* Footer links */}
          <View style={styles.footerRow}>
            <TouchableOpacity onPress={handleRestore} disabled={busy}>
              <Text style={styles.footerLink}>Restore</Text>
            </TouchableOpacity>
            <View style={styles.footerDot} />
            <TouchableOpacity onPress={() => void Linking.openURL("https://redlineapp.io/privacy")}>
              <Text style={styles.footerLink}>Privacy</Text>
            </TouchableOpacity>
            <View style={styles.footerDot} />
            <TouchableOpacity onPress={() => void Linking.openURL("https://redlineapp.io/terms")}>
              <Text style={styles.footerLink}>Terms</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.legalText}>
            Auto-renews until cancelled. Manage in Apple ID settings.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

/* ————————————————— Styles ————————————————— */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#090909",
  },
  scrollContent: {
    paddingTop: Platform.OS === "ios" ? 56 : 32,
    paddingBottom: 32,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  proBadge: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  proBadgeText: {
    fontSize: 11,
    fontFamily: "Orbitron_700Bold",
    color: "#000000",
    letterSpacing: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  visualCard: {
    height: 300,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    backgroundColor: "#0E0E0E",
    overflow: "hidden",
  },
  copyCard: {
    marginTop: -64,
    borderRadius: 24,
    padding: 22,
    paddingTop: 24,
    backgroundColor: "rgba(23,23,23,0.96)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  copyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  copyIconBubble: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(225,6,0,0.15)",
    borderWidth: 1,
    borderColor: "rgba(225,6,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  copyKicker: {
    fontSize: 10,
    fontFamily: "Orbitron_700Bold",
    color: "rgba(225,6,0,0.9)",
    letterSpacing: 2.5,
  },
  copyTitle: {
    fontSize: 25,
    fontFamily: "Orbitron_800ExtraBold",
    color: "#FFFFFF",
    lineHeight: 30,
  },
  copyLineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  copyDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: RED,
    marginTop: 7,
  },
  copyLine: {
    flex: 1,
    fontSize: 14,
    color: "rgba(255,255,255,0.65)",
    lineHeight: 19,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
    marginBottom: 20,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  dotActive: {
    width: 24,
    backgroundColor: RED,
    shadowColor: RED,
    shadowOpacity: 0.8,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  plansContainer: {
    paddingHorizontal: 20,
    gap: 12,
  },
  planCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 18,
    padding: 18,
    backgroundColor: "rgba(28,28,30,0.6)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.08)",
    position: "relative",
  },
  planCardSelected: {
    borderColor: RED,
    backgroundColor: "rgba(225,6,0,0.08)",
    shadowColor: RED,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  saveBadge: {
    position: "absolute",
    top: -11,
    right: 18,
    backgroundColor: RED,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  saveBadgeText: {
    fontSize: 10,
    fontFamily: "Orbitron_800ExtraBold",
    color: "#FFFFFF",
    letterSpacing: 1,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircleSelected: {
    borderColor: RED,
    backgroundColor: RED,
  },
  planTitle: {
    fontSize: 16,
    fontFamily: "Orbitron_700Bold",
    color: "#FFFFFF",
  },
  planSubtitle: {
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
    marginTop: 3,
  },
  strikePrice: {
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
    textDecorationLine: "line-through",
  },
  planPrice: {
    fontSize: 19,
    fontFamily: "Orbitron_800ExtraBold",
    color: "#FFFFFF",
  },
  planCadence: {
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
    marginTop: 1,
  },
  noPackagesCard: {
    marginHorizontal: 20,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 12,
  },
  noPackagesText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginHorizontal: 20,
    marginTop: 18,
    height: 56,
    borderRadius: 18,
    backgroundColor: RED,
    shadowColor: RED,
    shadowOpacity: 0.6,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  ctaBtnDisabled: {
    opacity: 0.5,
  },
  ctaText: {
    fontSize: 15,
    fontFamily: "Orbitron_800ExtraBold",
    color: "#FFFFFF",
    letterSpacing: 2,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    marginTop: 16,
  },
  footerLink: {
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
  },
  footerDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  legalText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.35)",
    textAlign: "center",
    marginTop: 12,
    paddingHorizontal: 24,
  },
});

/* Visual styles */
const vs = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  speedoValue: {
    fontSize: 48,
    fontFamily: "Orbitron_800ExtraBold",
    color: "#FFFFFF",
  },
  speedoUnit: {
    fontSize: 11,
    fontFamily: "Orbitron_700Bold",
    color: "rgba(255,255,255,0.55)",
    letterSpacing: 5,
    marginTop: 4,
  },
  lbRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 12,
  },
  lbRowTop: {
    borderColor: "rgba(225,6,0,0.5)",
    backgroundColor: "rgba(225,6,0,0.1)",
  },
  lbName: {
    fontSize: 14,
    fontFamily: "Orbitron_700Bold",
    color: "#FFFFFF",
  },
  lbValue: {
    fontSize: 18,
    fontFamily: "Orbitron_800ExtraBold",
    color: RED,
  },
  dimSmall: {
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
  },
  dimTiny: {
    fontSize: 10,
    color: "rgba(255,255,255,0.5)",
  },
  trackingCaps: {
    fontSize: 11,
    fontFamily: "Orbitron_700Bold",
    color: "rgba(255,255,255,0.55)",
    letterSpacing: 5,
  },
  bellCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: RED,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: RED,
    shadowOpacity: 0.7,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  glassPill: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  alertLabel: {
    fontSize: 11,
    fontFamily: "Orbitron_700Bold",
    color: RED,
    letterSpacing: 2,
  },
  alertText: {
    fontSize: 13,
    color: "#FFFFFF",
    marginTop: 2,
  },
  bubble: {
    maxWidth: "70%",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  bubbleMe: {
    backgroundColor: RED,
    borderBottomRightRadius: 6,
  },
  bubbleThem: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderBottomLeftRadius: 6,
  },
  bubbleText: {
    fontSize: 13,
    color: "#FFFFFF",
  },
  challengePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "rgba(225,6,0,0.15)",
    borderWidth: 1,
    borderColor: "rgba(225,6,0,0.4)",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  challengePillText: {
    fontSize: 10,
    fontFamily: "Orbitron_700Bold",
    color: RED,
    letterSpacing: 2.5,
  },
  prizeCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 24,
    paddingVertical: 20,
    alignItems: "center",
  },
  dimCaps: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 2,
  },
  prizeValue: {
    fontSize: 40,
    fontFamily: "Orbitron_800ExtraBold",
    color: RED,
    marginTop: 4,
  },
  countdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  timeValue: {
    fontSize: 14,
    fontFamily: "Orbitron_700Bold",
    color: "#FFFFFF",
  },
  timeLabel: {
    fontSize: 9,
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 2,
    marginTop: 2,
  },
  colonText: {
    fontSize: 14,
    fontFamily: "Orbitron_700Bold",
    color: "rgba(255,255,255,0.5)",
  },
  barsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    height: 90,
  },
  bar: {
    width: 8,
    borderRadius: 4,
  },
  trackCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  trackTitle: {
    fontSize: 13,
    fontFamily: "Orbitron_700Bold",
    color: "#FFFFFF",
  },
  trackIconBubble: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(225,6,0,0.15)",
    borderWidth: 1,
    borderColor: "rgba(225,6,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
})
