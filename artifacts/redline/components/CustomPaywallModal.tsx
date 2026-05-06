import React, { useState, useCallback, useEffect } from "react";
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
  Image,
} from "react-native";
import { X, Check, Crown } from "lucide-react-native";
import * as Haptics from "expo-haptics";

export type PaywallResult = "purchased" | "restored" | "cancelled" | "error" | "not_presented";

interface CustomPaywallModalProps {
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

const PRO_FEATURES = [
  "Unlimited friends boards & private leaderboards",
  "Pro telemetry: lap analysis, sectors, G-force history",
  "Premium themes (Carbon, Neon, Inferno, more)",
  "Custom share card backgrounds",
  "Advanced trip stats & weekly recap",
  "Priority support",
];

export default function CustomPaywallModal({
  visible,
  monthlyPackage,
  yearlyPackage,
  onClose,
  onPurchase,
  onRestore,
  verifyEntitlement,
}: CustomPaywallModalProps) {
  const [selected, setSelected] = useState<"monthly" | "yearly">("yearly");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelected("yearly");
      setBusy(false);
    }
  }, [visible]);

  const monthlyPrice = monthlyPackage?.product?.price ?? 0;
  const monthlyPriceString = monthlyPackage?.product?.priceString ?? (monthlyPrice ? `$${monthlyPrice.toFixed(2)}` : "");
  const monthlyCurrency = monthlyPackage?.product?.currencyCode ?? "USD";

  const yearlyPrice = yearlyPackage?.product?.price ?? 0;
  const yearlyPriceString = yearlyPackage?.product?.priceString ?? (yearlyPrice ? `$${yearlyPrice.toFixed(2)}` : "");
  const yearlyCurrency = yearlyPackage?.product?.currencyCode ?? monthlyCurrency;

  const comparePrice = monthlyPrice > 0 ? monthlyPrice * 12 : 0;
  const compareString = comparePrice > 0 ? formatPrice(comparePrice, yearlyCurrency) : "";
  const discountPercent =
    comparePrice > 0 && yearlyPrice > 0 && comparePrice > yearlyPrice
      ? Math.round((1 - yearlyPrice / comparePrice) * 100)
      : 0;

  const yearlyMonthlyEq = yearlyPrice > 0 ? yearlyPrice / 12 : 0;
  const yearlyMonthlyEqString = yearlyMonthlyEq > 0 ? formatPrice(yearlyMonthlyEq, yearlyCurrency) : "";

  const selectedPackage = selected === "monthly" ? monthlyPackage : yearlyPackage;

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
      const hasActive = !!customerInfo?.entitlements?.active && Object.keys(customerInfo.entitlements.active).length > 0;
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

  const monthlySelected = selected === "monthly";
  const yearlySelected = selected === "yearly";
  const hasAnyPackage = !!monthlyPackage || !!yearlyPackage;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={handleClose}>
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.headerRow}>
            <View style={{ width: 32 }} />
            <Text style={styles.headerTitle}>RedLine Pro</Text>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={handleClose}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <X color="#FFFFFF" size={22} />
            </TouchableOpacity>
          </View>

          <View style={styles.heroSection}>
            <View style={styles.crownCircle}>
              <Crown color="#FFD700" size={32} />
            </View>
            <Text style={styles.heroTitle}>Unlock everything</Text>
            <Text style={styles.heroSubtitle}>
              Take RedLine to the next level with Pro features built for serious drivers.
            </Text>
          </View>

          <View style={styles.featuresList}>
            {PRO_FEATURES.map((feature) => (
              <View key={feature} style={styles.featureRow}>
                <View style={styles.featureCheck}>
                  <Check size={14} color="#000000" strokeWidth={3} />
                </View>
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}
          </View>

          {!hasAnyPackage ? (
            <View style={styles.noPackagesCard}>
              <ActivityIndicator color="#CC0000" />
              <Text style={styles.noPackagesText}>Loading plans…</Text>
            </View>
          ) : (
            <View style={styles.plansContainer}>
              {yearlyPackage && (
                <TouchableOpacity
                  style={[styles.planCard, yearlySelected && styles.planCardSelected]}
                  onPress={() => {
                    if (Platform.OS !== "web") {
                      void Haptics.selectionAsync();
                    }
                    setSelected("yearly");
                  }}
                  activeOpacity={0.85}
                >
                  {discountPercent > 0 && (
                    <View style={styles.discountBadge}>
                      <Text style={styles.discountBadgeText}>SAVE {discountPercent}%</Text>
                    </View>
                  )}
                  <View style={styles.planHeader}>
                    <View style={[styles.radioOuter, yearlySelected && styles.radioOuterSelected]}>
                      {yearlySelected && <View style={styles.radioInner} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.planName}>Yearly</Text>
                      {yearlyMonthlyEqString ? (
                        <Text style={styles.planSubName}>{yearlyMonthlyEqString} / month, billed annually</Text>
                      ) : null}
                    </View>
                    <View style={styles.priceColumn}>
                      <View style={styles.priceLine}>
                        {compareString ? (
                          <Text style={styles.priceCompare}>{compareString}</Text>
                        ) : null}
                        <Text style={styles.priceValue}>{yearlyPriceString}</Text>
                      </View>
                      <Text style={styles.pricePeriod}>per year</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}

              {monthlyPackage && (
                <TouchableOpacity
                  style={[styles.planCard, monthlySelected && styles.planCardSelected]}
                  onPress={() => {
                    if (Platform.OS !== "web") {
                      void Haptics.selectionAsync();
                    }
                    setSelected("monthly");
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.planHeader}>
                    <View style={[styles.radioOuter, monthlySelected && styles.radioOuterSelected]}>
                      {monthlySelected && <View style={styles.radioInner} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.planName}>Monthly</Text>
                      <Text style={styles.planSubName}>Cancel anytime</Text>
                    </View>
                    <View style={styles.priceColumn}>
                      <Text style={styles.priceValue}>{monthlyPriceString}</Text>
                      <Text style={styles.pricePeriod}>per month</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          )}

          <TouchableOpacity
            style={[styles.purchaseBtn, (busy || !selectedPackage) && styles.purchaseBtnDisabled]}
            onPress={handlePurchase}
            activeOpacity={0.85}
            disabled={busy || !selectedPackage}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Crown color="#FFFFFF" size={18} />
                <Text style={styles.purchaseBtnText}>
                  {selected === "yearly" ? "START YEARLY PLAN" : "START MONTHLY PLAN"}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.restoreBtn}
            onPress={handleRestore}
            activeOpacity={0.7}
            disabled={busy}
          >
            <Text style={styles.restoreBtnText}>Restore Purchases</Text>
          </TouchableOpacity>

          <Text style={styles.legalText}>
            Auto-renews until cancelled. Manage your subscription in your Apple ID settings.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0A0A",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 56 : 32,
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 14,
    fontFamily: "Orbitron_700Bold",
    color: "#FFFFFF",
    letterSpacing: 1.5,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  heroSection: {
    alignItems: "center",
    marginBottom: 28,
  },
  crownCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,215,0,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 24,
    fontFamily: "Orbitron_700Bold",
    color: "#FFFFFF",
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  heroSubtitle: {
    fontSize: 13,
    fontFamily: "Orbitron_400Regular",
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  featuresList: {
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 10,
  },
  featureCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFD700",
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Orbitron_500Medium",
    color: "rgba(255,255,255,0.92)",
    lineHeight: 18,
  },
  plansContainer: {
    gap: 12,
    marginBottom: 20,
  },
  planCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 16,
    position: "relative",
  },
  planCardSelected: {
    borderColor: "#CC0000",
    backgroundColor: "rgba(204,0,0,0.08)",
  },
  discountBadge: {
    position: "absolute",
    top: -10,
    right: 16,
    backgroundColor: "#FFD700",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  discountBadgeText: {
    fontSize: 10,
    fontFamily: "Orbitron_800ExtraBold",
    color: "#000000",
    letterSpacing: 1,
  },
  planHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: {
    borderColor: "#CC0000",
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#CC0000",
  },
  planName: {
    fontSize: 15,
    fontFamily: "Orbitron_700Bold",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  planSubName: {
    fontSize: 11,
    fontFamily: "Orbitron_400Regular",
    color: "rgba(255,255,255,0.5)",
  },
  priceColumn: {
    alignItems: "flex-end",
  },
  priceLine: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  priceCompare: {
    fontSize: 12,
    fontFamily: "Orbitron_500Medium",
    color: "rgba(255,255,255,0.4)",
    textDecorationLine: "line-through",
  },
  priceValue: {
    fontSize: 18,
    fontFamily: "Orbitron_700Bold",
    color: "#FFFFFF",
  },
  pricePeriod: {
    fontSize: 10,
    fontFamily: "Orbitron_400Regular",
    color: "rgba(255,255,255,0.5)",
    marginTop: 2,
    letterSpacing: 0.5,
  },
  noPackagesCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 20,
    gap: 12,
  },
  noPackagesText: {
    fontSize: 12,
    fontFamily: "Orbitron_400Regular",
    color: "rgba(255,255,255,0.5)",
  },
  purchaseBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#CC0000",
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
    marginBottom: 12,
  },
  purchaseBtnDisabled: {
    opacity: 0.5,
  },
  purchaseBtnText: {
    fontSize: 14,
    fontFamily: "Orbitron_800ExtraBold",
    color: "#FFFFFF",
    letterSpacing: 1,
  },
  restoreBtn: {
    paddingVertical: 12,
    alignItems: "center",
  },
  restoreBtnText: {
    fontSize: 12,
    fontFamily: "Orbitron_500Medium",
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 0.5,
  },
  legalText: {
    fontSize: 10,
    fontFamily: "Orbitron_400Regular",
    color: "rgba(255,255,255,0.4)",
    textAlign: "center",
    lineHeight: 14,
    marginTop: 8,
    paddingHorizontal: 8,
  },
});
