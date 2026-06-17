import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform } from "react-native";
import { Crown, Settings as SettingsIcon, RefreshCw } from "lucide-react-native";
import { useSubscription, formatProDuration } from "@/lib/revenuecat";
import { useSettings } from "@/providers/SettingsProvider";
import type { ThemeColors } from "@/constants/colors";

export default function SubscriptionSection() {
  const { colors } = useSettings();
  const styles = createStyles(colors);
  const {
    isAvailable,
    isLoading,
    isSubscribed,
    proSinceMillis,
    monthlyPackage,
    yearlyPackage,
    presentPaywall,
    presentCustomerCenter,
    restore,
    isRestoring,
    refetchCustomerInfo,
  } = useSubscription();

  if (!isAvailable) {
    if (Platform.OS === "web") return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>SUBSCRIPTION</Text>
        <Text style={styles.bodyMuted}>Subscriptions are unavailable in this build.</Text>
      </View>
    );
  }

  const handleUpgrade = async () => {
    const result = await presentPaywall('subscription_section');
    if (result === "purchased") {
      Alert.alert("Welcome to RedLine Pro!", "Your subscription is now active.");
      void refetchCustomerInfo();
    } else if (result === "restored") {
      Alert.alert("Subscription Restored", "Your previous purchases have been restored.");
      void refetchCustomerInfo();
    } else if (result === "not_presented") {
      Alert.alert(
        "Paywall Unavailable",
        "The subscription screen isn't available in this build. Try again on a development or production build with the RevenueCat SDK installed.",
      );
    } else if (result === "error") {
      Alert.alert("Couldn't open paywall", "Please try again in a moment.");
    }
  };

  const handleManage = async () => {
    const ok = await presentCustomerCenter();
    if (!ok) {
      Alert.alert("Couldn't open Manage Subscription", "Please try again in a moment.");
    }
  };

  const handleRestore = async () => {
    try {
      await restore();
      void refetchCustomerInfo();
      Alert.alert("Restore Complete", "If you had a previous subscription, it's now active.");
    } catch (err: any) {
      Alert.alert("Restore Failed", err?.message ?? "Please try again later.");
    }
  };

  if (isLoading) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>SUBSCRIPTION</Text>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const proDurationLabel = formatProDuration(proSinceMillis);

  if (isSubscribed) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>SUBSCRIPTION</Text>
        <View style={styles.proBanner}>
          <Crown color="#FFD700" size={20} />
          <View style={styles.proBannerTextWrap}>
            <Text style={styles.proBannerText}>RedLine App Pro Active</Text>
            {proDurationLabel ? (
              <Text style={styles.proBannerSubText}>{proDurationLabel}</Text>
            ) : null}
          </View>
        </View>
        <TouchableOpacity style={styles.manageButton} onPress={handleManage} activeOpacity={0.8}>
          <SettingsIcon color={colors.accent} size={18} />
          <Text style={styles.manageButtonText}>MANAGE SUBSCRIPTION</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const monthlyPrice = monthlyPackage?.product?.priceString;
  const yearlyPrice = yearlyPackage?.product?.priceString;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>UPGRADE TO PRO</Text>
      {(monthlyPrice || yearlyPrice) ? (
        <View style={styles.priceRow}>
          {monthlyPrice ? (
            <Text style={styles.priceText}>{monthlyPrice}/mo</Text>
          ) : null}
          {monthlyPrice && yearlyPrice ? <Text style={styles.priceDot}> · </Text> : null}
          {yearlyPrice ? (
            <Text style={styles.priceText}>{yearlyPrice}/yr</Text>
          ) : null}
        </View>
      ) : null}
      <TouchableOpacity style={styles.upgradeButton} onPress={handleUpgrade} activeOpacity={0.85}>
        <Crown color="#FFFFFF" size={18} />
        <Text style={styles.upgradeButtonText}>UNLOCK REDLINE PRO</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.restoreButton} onPress={handleRestore} disabled={isRestoring} activeOpacity={0.7}>
        <RefreshCw color={colors.text} size={14} />
        <Text style={styles.restoreButtonText}>{isRestoring ? "Restoring…" : "Restore Purchases"}</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    section: {
      marginTop: 24,
      paddingHorizontal: 4,
    },
    sectionTitle: {
      color: colors.accent,
      fontSize: 12,
      fontWeight: "700" as const,
      letterSpacing: 1.2,
      marginBottom: 12,
    },
    bodyMuted: {
      color: colors.text,
      opacity: 0.6,
      fontSize: 13,
    },
    proBanner: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: "rgba(255,215,0,0.10)",
      borderWidth: 1,
      borderColor: "rgba(255,215,0,0.45)",
      marginBottom: 12,
    },
    proBannerTextWrap: {
      flex: 1,
    },
    proBannerText: {
      color: "#FFD700",
      fontSize: 14,
      fontWeight: "700" as const,
      letterSpacing: 0.6,
    },
    proBannerSubText: {
      color: "#FFD700",
      opacity: 0.75,
      fontSize: 11,
      fontWeight: "600" as const,
      letterSpacing: 0.4,
      marginTop: 2,
    },
    manageButton: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 8,
      paddingVertical: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.accent,
      backgroundColor: "transparent",
    },
    manageButtonText: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: "700" as const,
      letterSpacing: 1,
    },
    priceRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      marginBottom: 10,
    },
    priceText: {
      color: colors.text,
      fontSize: 13,
      opacity: 0.85,
    },
    priceDot: {
      color: colors.text,
      opacity: 0.5,
      fontSize: 13,
    },
    upgradeButton: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 8,
      paddingVertical: 14,
      borderRadius: 10,
      backgroundColor: colors.accent,
      marginBottom: 10,
    },
    upgradeButtonText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "800" as const,
      letterSpacing: 1,
    },
    restoreButton: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 6,
      paddingVertical: 8,
    },
    restoreButtonText: {
      color: colors.text,
      opacity: 0.7,
      fontSize: 12,
    },
  });
}
