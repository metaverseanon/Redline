import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Crown, Check, ChevronRight, Bell, Share2, Flag, Trophy, Music } from 'lucide-react-native';
import { useSubscription, REVENUECAT_ENTITLEMENT_IDENTIFIER } from '@/lib/revenuecat';

interface OnboardPaywallPageProps {
  onContinue: () => void;
  width: number;
  topInset: number;
  bottomInset: number;
  ctaLabel?: string;
  skipLabel?: string;
}

const PRO_HIGHLIGHTS = [
  { icon: Bell, text: 'Friends boards leave alerts' },
  { icon: Share2, text: 'iOS share-sheet board invites' },
  { icon: Flag, text: 'Custom challenges with countdown' },
  { icon: Trophy, text: 'Rank-up confetti celebrations' },
  { icon: Music, text: 'Drive soundtracks on recaps & posts' },
];

function formatPrice(price: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    return `$${price.toFixed(2)}`;
  }
}

export default function OnboardPaywallPage({
  onContinue,
  width,
  topInset,
  bottomInset,
  ctaLabel,
  skipLabel = 'Maybe later',
}: OnboardPaywallPageProps) {
  const { monthlyPackage, yearlyPackage, purchase, restore, isLoading, refetchCustomerInfo } = useSubscription();
  const [selected, setSelected] = useState<'monthly' | 'yearly'>('yearly');
  const [busy, setBusy] = useState(false);

  const monthlyPrice = monthlyPackage?.product?.price ?? 0;
  const monthlyPriceString =
    monthlyPackage?.product?.priceString ?? (monthlyPrice ? `$${monthlyPrice.toFixed(2)}` : '');
  const monthlyCurrency = monthlyPackage?.product?.currencyCode ?? 'USD';

  const yearlyPrice = yearlyPackage?.product?.price ?? 0;
  const yearlyPriceString =
    yearlyPackage?.product?.priceString ?? (yearlyPrice ? `$${yearlyPrice.toFixed(2)}` : '');
  const yearlyCurrency = yearlyPackage?.product?.currencyCode ?? monthlyCurrency;

  const comparePrice = monthlyPrice > 0 ? monthlyPrice * 12 : 0;
  const compareString = comparePrice > 0 ? formatPrice(comparePrice, yearlyCurrency) : '';
  const discountPercent =
    comparePrice > 0 && yearlyPrice > 0 && comparePrice > yearlyPrice
      ? Math.round((1 - yearlyPrice / comparePrice) * 100)
      : 0;
  const yearlyMonthlyEq = yearlyPrice > 0 ? yearlyPrice / 12 : 0;
  const yearlyMonthlyEqString = yearlyMonthlyEq > 0 ? formatPrice(yearlyMonthlyEq, yearlyCurrency) : '';

  const selectedPackage = selected === 'monthly' ? monthlyPackage : yearlyPackage;
  const hasAnyPackage = !!monthlyPackage || !!yearlyPackage;

  const handleBuy = useCallback(async () => {
    if (!selectedPackage) {
      Alert.alert('Unavailable', 'This plan is not available right now. Please try again in a moment.');
      return;
    }
    if (busy) return;
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy(true);
    try {
      const customerInfo: any = await purchase(selectedPackage);
      const isActive =
        !!customerInfo?.entitlements?.active &&
        Object.keys(customerInfo.entitlements.active).length > 0;
      if (isActive) {
        onContinue();
        return;
      }
      try {
        const fresh: any = await refetchCustomerInfo?.();
        const freshActive =
          !!fresh?.data?.entitlements?.active &&
          Object.keys(fresh.data.entitlements.active).length > 0;
        if (freshActive) {
          onContinue();
          return;
        }
      } catch {}
      onContinue();
    } catch (err: any) {
      const message: string = err?.message ?? 'Purchase failed. Please try again.';
      const code: string = String(err?.code ?? err?.userInfo?.readable_error_code ?? '');
      const userCancelled =
        err?.userCancelled === true ||
        code === '1' ||
        /PURCHASE_CANCELLED/i.test(code) ||
        /cancel/i.test(message);
      if (userCancelled) return;
      try {
        const fresh: any = await refetchCustomerInfo?.();
        const freshActive =
          !!fresh?.data?.entitlements?.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] ||
          (!!fresh?.data?.entitlements?.active &&
            Object.keys(fresh.data.entitlements.active).length > 0);
        if (freshActive) {
          onContinue();
          return;
        }
      } catch {}
      Alert.alert('Purchase failed', message);
    } finally {
      setBusy(false);
    }
  }, [selectedPackage, purchase, onContinue, busy, refetchCustomerInfo]);

  const handleRestore = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const customerInfo: any = await restore();
      const hasActive =
        !!customerInfo?.entitlements?.active &&
        Object.keys(customerInfo.entitlements.active).length > 0;
      if (hasActive) {
        Alert.alert('Restored', 'Your subscription has been restored.');
        onContinue();
      } else {
        Alert.alert('Nothing to restore', "We couldn't find any previous purchases on this Apple ID.");
      }
    } catch (err: any) {
      Alert.alert('Restore failed', err?.message ?? 'Please try again later.');
    } finally {
      setBusy(false);
    }
  }, [restore, onContinue, busy]);

  const handleSkip = useCallback(() => {
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onContinue();
  }, [onContinue]);

  const monthlySelected = selected === 'monthly';
  const yearlySelected = selected === 'yearly';

  return (
    <View style={[styles.page, { width }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: topInset + 24, paddingBottom: bottomInset + 16 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.crownWrap}>
          <View style={styles.crownGlow} />
          <View style={styles.crownCircle}>
            <Crown size={36} color="#FFD700" />
          </View>
        </View>

        <View style={styles.proBadge}>
          <Text style={styles.proBadgeText}>REDLINE PRO</Text>
        </View>

        <Text style={styles.title}>Unlock</Text>
        <Text style={styles.highlight}>Everything</Text>
        <Text style={styles.subtitle}>
          Friends boards, custom challenges, share invites, rank-up celebrations and more.
        </Text>

        <View style={styles.featureList}>
          {PRO_HIGHLIGHTS.map((f) => {
            const Icon = f.icon;
            return (
              <View key={f.text} style={styles.featureRow}>
                <View style={styles.featureCheck}>
                  <Check size={12} color="#000000" strokeWidth={3} />
                </View>
                <Icon size={14} color="#CC0000" />
                <Text style={styles.featureText}>{f.text}</Text>
              </View>
            );
          })}
        </View>

        {!hasAnyPackage ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color="#CC0000" />
            <Text style={styles.loadingText}>Loading plans…</Text>
          </View>
        ) : (
          <View style={styles.plans}>
            {yearlyPackage && (
              <TouchableOpacity
                onPress={() => {
                  if (Platform.OS !== 'web') void Haptics.selectionAsync();
                  setSelected('yearly');
                }}
                style={[styles.planCard, yearlySelected && styles.planCardSelected]}
                activeOpacity={0.85}
                testID="paywall-yearly"
              >
                {discountPercent > 0 && (
                  <View style={styles.saveBadge}>
                    <Text style={styles.saveBadgeText}>SAVE {discountPercent}%</Text>
                  </View>
                )}
                <View style={[styles.radio, yearlySelected && styles.radioSelected]}>
                  {yearlySelected && <View style={styles.radioInner} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.planName}>Yearly</Text>
                  {yearlyMonthlyEqString ? (
                    <Text style={styles.planSub}>{yearlyMonthlyEqString} / mo · billed yearly</Text>
                  ) : null}
                </View>
                <View style={styles.priceCol}>
                  {compareString ? <Text style={styles.priceCompare}>{compareString}</Text> : null}
                  <Text style={styles.priceValue}>{yearlyPriceString}</Text>
                  <Text style={styles.pricePeriod}>per year</Text>
                </View>
              </TouchableOpacity>
            )}

            {monthlyPackage && (
              <TouchableOpacity
                onPress={() => {
                  if (Platform.OS !== 'web') void Haptics.selectionAsync();
                  setSelected('monthly');
                }}
                style={[styles.planCard, monthlySelected && styles.planCardSelected]}
                activeOpacity={0.85}
                testID="paywall-monthly"
              >
                <View style={[styles.radio, monthlySelected && styles.radioSelected]}>
                  {monthlySelected && <View style={styles.radioInner} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.planName}>Monthly</Text>
                  <Text style={styles.planSub}>Cancel anytime</Text>
                </View>
                <View style={styles.priceCol}>
                  <Text style={styles.priceValue}>{monthlyPriceString}</Text>
                  <Text style={styles.pricePeriod}>per month</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        )}

        <TouchableOpacity
          onPress={handleBuy}
          disabled={busy || isLoading || !selectedPackage}
          style={[
            styles.buyButton,
            (busy || isLoading || !selectedPackage) && styles.buyButtonDisabled,
          ]}
          activeOpacity={0.85}
          testID="paywall-buy"
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Crown size={18} color="#FFFFFF" />
              <Text style={styles.buyButtonText}>
                {ctaLabel ?? (selected === 'yearly' ? 'START YEARLY' : 'START MONTHLY')}
              </Text>
              <ChevronRight size={18} color="#FFFFFF" />
            </>
          )}
        </TouchableOpacity>

        <View style={styles.bottomLinks}>
          <TouchableOpacity onPress={handleRestore} disabled={busy} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.linkText}>Restore Purchases</Text>
          </TouchableOpacity>
          <Text style={styles.linkDot}>·</Text>
          <TouchableOpacity onPress={handleSkip} disabled={busy} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} testID="paywall-skip">
            <Text style={styles.linkText}>{skipLabel}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.legal}>
          Auto-renews until cancelled. Manage in your Apple ID settings.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollContent: {
    paddingHorizontal: 24,
    alignItems: 'center' as const,
  },
  crownWrap: {
    width: 96,
    height: 96,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 12,
  },
  crownGlow: {
    position: 'absolute' as const,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255,215,0,0.08)',
  },
  crownCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,215,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.4)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  proBadge: {
    backgroundColor: 'rgba(204,0,0,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(204,0,0,0.35)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    marginBottom: 14,
  },
  proBadgeText: {
    color: '#CC0000',
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 1.5,
  },
  title: {
    fontSize: 26,
    fontWeight: '300' as const,
    color: '#8E8E93',
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    textAlign: 'center' as const,
  },
  highlight: {
    fontSize: 38,
    fontWeight: '800' as const,
    color: '#FFFFFF',
    marginTop: 2,
    marginBottom: 12,
    letterSpacing: -0.5,
    textAlign: 'center' as const,
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center' as const,
    lineHeight: 20,
    marginBottom: 18,
    maxWidth: 320,
  },
  featureList: {
    width: '100%' as any,
    gap: 8,
    marginBottom: 18,
  },
  featureRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
  },
  featureCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFD700',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  featureText: {
    flex: 1,
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '500' as const,
  },
  loadingCard: {
    width: '100%' as any,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 22,
    alignItems: 'center' as const,
    gap: 10,
    marginBottom: 14,
  },
  loadingText: {
    color: '#8E8E93',
    fontSize: 13,
  },
  plans: {
    width: '100%' as any,
    gap: 10,
    marginBottom: 16,
  },
  planCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    position: 'relative' as const,
  },
  planCardSelected: {
    borderColor: '#CC0000',
    backgroundColor: 'rgba(204,0,0,0.08)',
  },
  saveBadge: {
    position: 'absolute' as const,
    top: -10,
    right: 14,
    backgroundColor: '#FFD700',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 9,
  },
  saveBadgeText: {
    fontSize: 10,
    fontWeight: '800' as const,
    color: '#000000',
    letterSpacing: 0.8,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  radioSelected: {
    borderColor: '#CC0000',
  },
  radioInner: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#CC0000',
  },
  planName: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  planSub: {
    fontSize: 11,
    color: '#8E8E93',
  },
  priceCol: {
    alignItems: 'flex-end' as const,
  },
  priceCompare: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    textDecorationLine: 'line-through' as const,
    marginBottom: 2,
  },
  priceValue: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: '#FFFFFF',
  },
  pricePeriod: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 1,
    letterSpacing: 0.4,
  },
  buyButton: {
    width: '100%' as any,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#CC0000',
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
    shadowColor: '#CC0000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  buyButtonDisabled: {
    opacity: 0.55,
  },
  buyButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800' as const,
    letterSpacing: 1,
  },
  bottomLinks: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 10,
    marginTop: 16,
  },
  linkText: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '500' as const,
  },
  linkDot: {
    color: '#3A3A3C',
    fontSize: 13,
  },
  legal: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    textAlign: 'center' as const,
    lineHeight: 14,
    marginTop: 12,
    paddingHorizontal: 12,
  },
});
