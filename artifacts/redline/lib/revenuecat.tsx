import React, { createContext, useContext, useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const REVENUECAT_TEST_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const REVENUECAT_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

export const REVENUECAT_ENTITLEMENT_IDENTIFIER = "RedLine App Pro";

export const REVENUECAT_PACKAGE_MONTHLY = "monthly";
export const REVENUECAT_PACKAGE_YEARLY = "yearly";

let PurchasesModule: any = null;
let PurchasesUIModule: any = null;
let nativeModulesAvailable = false;

if (Platform.OS !== "web") {
  try {
    PurchasesModule = require("react-native-purchases").default;
    nativeModulesAvailable = true;
  } catch (err) {
    console.warn("[RC] react-native-purchases not available:", err);
  }
  try {
    PurchasesUIModule = require("react-native-purchases-ui").default;
  } catch (err) {
    console.warn("[RC] react-native-purchases-ui not available:", err);
  }
}

function getRevenueCatApiKey(): string {
  if (__DEV__ || Constants.executionEnvironment === "storeClient") {
    if (!REVENUECAT_TEST_API_KEY) {
      throw new Error("EXPO_PUBLIC_REVENUECAT_TEST_API_KEY not configured");
    }
    return REVENUECAT_TEST_API_KEY;
  }

  if (Platform.OS === "ios") {
    if (!REVENUECAT_IOS_API_KEY) {
      if (REVENUECAT_TEST_API_KEY) return REVENUECAT_TEST_API_KEY;
      throw new Error("EXPO_PUBLIC_REVENUECAT_IOS_API_KEY not configured");
    }
    return REVENUECAT_IOS_API_KEY;
  }

  if (Platform.OS === "android") {
    if (!REVENUECAT_ANDROID_API_KEY) {
      if (REVENUECAT_TEST_API_KEY) return REVENUECAT_TEST_API_KEY;
      throw new Error("EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY not configured");
    }
    return REVENUECAT_ANDROID_API_KEY;
  }

  if (REVENUECAT_TEST_API_KEY) return REVENUECAT_TEST_API_KEY;
  throw new Error("No RevenueCat API key configured for this platform");
}

let initialized = false;
let isConfigured = false;
const configListeners = new Set<() => void>();

function notifyConfigChange() {
  for (const listener of configListeners) {
    try {
      listener();
    } catch {}
  }
}

export function isRevenueCatConfigured() {
  return isConfigured;
}

export function initializeRevenueCat() {
  if (initialized) return;
  initialized = true;
  if (Platform.OS === "web") {
    console.log("[RC] Web platform; skipping native init");
    return;
  }
  if (!nativeModulesAvailable || !PurchasesModule) {
    console.warn("[RC] Native module unavailable; running in mock mode");
    return;
  }
  try {
    const apiKey = getRevenueCatApiKey();
    PurchasesModule.setLogLevel(__DEV__ ? PurchasesModule.LOG_LEVEL.DEBUG : PurchasesModule.LOG_LEVEL.WARN);
    PurchasesModule.configure({ apiKey });
    isConfigured = true;
    notifyConfigChange();
    console.log("[RC] Configured RevenueCat with key prefix:", apiKey.slice(0, 5));
  } catch (err) {
    console.warn("[RC] configure failed:", err);
  }
}

export async function identifyRevenueCatUser(userId: string | null | undefined) {
  if (!isConfigured || !PurchasesModule || Platform.OS === "web") return;
  try {
    if (userId) {
      await PurchasesModule.logIn(userId);
      console.log("[RC] Logged in user:", userId);
    } else {
      await PurchasesModule.logOut();
      console.log("[RC] Logged out");
    }
  } catch (err) {
    console.warn("[RC] identifyRevenueCatUser failed:", err);
  }
}

function useSubscriptionContext(userId?: string | null) {
  const queryClient = useQueryClient();
  const [configured, setConfigured] = useState<boolean>(isConfigured);

  useEffect(() => {
    if (isConfigured) {
      setConfigured(true);
      return;
    }
    const listener = () => setConfigured(isConfigured);
    configListeners.add(listener);
    return () => {
      configListeners.delete(listener);
    };
  }, []);

  const enabled = configured && nativeModulesAvailable && Platform.OS !== "web" && !!PurchasesModule;
  const userKey = userId ?? "anonymous";

  const customerInfoQuery = useQuery({
    queryKey: ["revenuecat", "customer-info", userKey],
    queryFn: async () => {
      if (!enabled) return null;
      return PurchasesModule.getCustomerInfo();
    },
    staleTime: 60 * 1000,
    enabled,
  });

  const offeringsQuery = useQuery({
    queryKey: ["revenuecat", "offerings"],
    queryFn: async () => {
      if (!enabled) return null;
      return PurchasesModule.getOfferings();
    },
    staleTime: 5 * 60 * 1000,
    enabled,
  });

  const purchaseMutation = useMutation({
    mutationFn: async (packageToPurchase: any) => {
      if (!enabled) throw new Error("Purchases unavailable on this platform");
      const { customerInfo } = await PurchasesModule.purchasePackage(packageToPurchase);
      return customerInfo;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["revenuecat", "customer-info"] });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      if (!enabled) throw new Error("Purchases unavailable on this platform");
      return PurchasesModule.restorePurchases();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["revenuecat", "customer-info"] });
    },
  });

  const presentPaywall = useCallback(
    async (options?: { offering?: any; requiredEntitlementIdentifier?: string }): Promise<"purchased" | "restored" | "cancelled" | "error" | "not_presented"> => {
      if (Platform.OS === "web" || !PurchasesUIModule) {
        console.warn("[RC] Paywall UI unavailable on this platform");
        return "not_presented";
      }
      try {
        const offering = options?.offering ?? offeringsQuery.data?.current;
        if (!offering) {
          console.warn("[RC] No current offering available to present");
          return "error";
        }

        const presenter = options?.requiredEntitlementIdentifier
          ? PurchasesUIModule.presentPaywallIfNeeded
          : PurchasesUIModule.presentPaywall;

        const result = await presenter({
          offering,
          ...(options?.requiredEntitlementIdentifier && {
            requiredEntitlementIdentifier: options.requiredEntitlementIdentifier,
          }),
        });

        await queryClient.invalidateQueries({ queryKey: ["revenuecat", "customer-info"] });

        const PAYWALL_RESULT = PurchasesUIModule.PAYWALL_RESULT ?? {};
        switch (result) {
          case PAYWALL_RESULT.PURCHASED:
            return "purchased";
          case PAYWALL_RESULT.RESTORED:
            return "restored";
          case PAYWALL_RESULT.CANCELLED:
            return "cancelled";
          case PAYWALL_RESULT.NOT_PRESENTED:
            return "not_presented";
          default:
            return "error";
        }
      } catch (err) {
        console.error("[RC] presentPaywall failed:", err);
        return "error";
      }
    },
    [offeringsQuery.data, queryClient]
  );

  const presentCustomerCenter = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === "web" || !PurchasesUIModule?.presentCustomerCenter) {
      console.warn("[RC] Customer Center unavailable on this platform");
      return false;
    }
    try {
      await PurchasesUIModule.presentCustomerCenter();
      await queryClient.invalidateQueries({ queryKey: ["revenuecat", "customer-info"] });
      return true;
    } catch (err) {
      console.error("[RC] presentCustomerCenter failed:", err);
      return false;
    }
  }, [queryClient]);

  const customerInfo = customerInfoQuery.data;
  const isSubscribed = !!customerInfo?.entitlements?.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER];

  const currentOffering = offeringsQuery.data?.current ?? null;
  const monthlyPackage = currentOffering?.availablePackages?.find(
    (p: any) => p.identifier === REVENUECAT_PACKAGE_MONTHLY || p.packageType === "MONTHLY"
  ) ?? null;
  const yearlyPackage = currentOffering?.availablePackages?.find(
    (p: any) => p.identifier === REVENUECAT_PACKAGE_YEARLY || p.packageType === "ANNUAL"
  ) ?? null;

  return {
    isAvailable: enabled,
    customerInfo,
    offerings: offeringsQuery.data,
    currentOffering,
    monthlyPackage,
    yearlyPackage,
    isSubscribed,
    isLoading: customerInfoQuery.isLoading || offeringsQuery.isLoading,
    purchase: purchaseMutation.mutateAsync,
    restore: restoreMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    isRestoring: restoreMutation.isPending,
    presentPaywall,
    presentCustomerCenter,
    refetchCustomerInfo: customerInfoQuery.refetch,
  };
}

type SubscriptionContextValue = ReturnType<typeof useSubscriptionContext>;
const Context = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children, userId }: { children: React.ReactNode; userId?: string | null }) {
  const value = useSubscriptionContext(userId);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!value.isAvailable) return;
    let cancelled = false;
    (async () => {
      await identifyRevenueCatUser(userId ?? null);
      if (cancelled) return;
      await queryClient.invalidateQueries({ queryKey: ["revenuecat", "customer-info"] });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, value.isAvailable, queryClient]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSubscription() {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useSubscription must be used within a SubscriptionProvider");
  }
  return ctx;
}
