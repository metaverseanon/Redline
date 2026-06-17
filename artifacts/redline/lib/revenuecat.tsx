import React, { createContext, useContext, useCallback, useEffect, useState, useRef } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import CustomPaywallModal, { PaywallResult } from "@/components/CustomPaywallModal";
import { tiktokTrackSubscribe, tiktokTrackPurchase } from "@/lib/tiktok";
import { metaTrackSubscribe, metaTrackPurchase } from "@/lib/meta";
import { trpc } from "@/lib/trpc";

const REVENUECAT_TEST_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const REVENUECAT_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

export const REVENUECAT_ENTITLEMENT_IDENTIFIER = "RedLine App Pro";

export const REVENUECAT_PACKAGE_MONTHLY = "monthly";
export const REVENUECAT_PACKAGE_YEARLY = "yearly";

const PRO_OVERRIDE_EMAILS: string[] = [];

function hasProOverride(email: string | null | undefined): boolean {
  if (!email) return false;
  return PRO_OVERRIDE_EMAILS.includes(email.trim().toLowerCase());
}

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

type PaywallAnalyticsHandler = (event: string, properties?: Record<string, unknown>) => void;
let paywallAnalyticsHandler: PaywallAnalyticsHandler | null = null;

export function setPaywallAnalyticsHandler(handler: PaywallAnalyticsHandler | null) {
  paywallAnalyticsHandler = handler;
}

function logPaywallEvent(event: string, properties?: Record<string, unknown>) {
  console.log("[RC][analytics]", event, properties ?? {});
  try {
    paywallAnalyticsHandler?.(event, properties);
  } catch (err) {
    console.warn("[RC][analytics] handler threw:", err);
  }
}

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

function useSubscriptionContext(userId?: string | null, userEmail?: string | null) {
  const queryClient = useQueryClient();
  const [configured, setConfigured] = useState<boolean>(isConfigured);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const paywallResolveRef = useRef<((result: PaywallResult) => void) | null>(null);

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
      try {
        const product = packageToPurchase?.product ?? {};
        const value = Number(product?.price ?? 0);
        const currency = String(product?.currencyCode ?? "USD");
        const productId = String(product?.identifier ?? packageToPurchase?.identifier ?? "unknown");
        const productName = String(product?.title ?? product?.description ?? productId);
        // TikTok uses eventId for DEDUPLICATION — identical eventIds are dropped.
        // Never use originalAppUserId here (it's the constant RC user id, so every
        // repeat Subscribe would be deduped and silently never record). Build a
        // unique id per purchase: latest purchase timestamp (unique per txn) plus
        // a random suffix so even same-millisecond retries are distinct.
        const purchaseMillis =
          customerInfo?.entitlements?.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER]?.latestPurchaseDateMillis;
        const orderId = `${productId}_${purchaseMillis ?? Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        // Fire even if price comes back as 0 (StoreKit sometimes returns 0 in
        // sandbox / before product metadata hydrates) — TikTok still needs the
        // event for attribution. Use a safe fallback value.
        const safeValue = value > 0 ? value : 0.01;
        void tiktokTrackSubscribe({ value: safeValue, currency, productId, productName, quantity: 1, orderId });
        void tiktokTrackPurchase({ value: safeValue, currency, productId, orderId });
        void metaTrackSubscribe({ value: safeValue, currency, productId, productName, orderId });
        void metaTrackPurchase({ value: safeValue, currency, productId, orderId });
        logPaywallEvent("paywall_purchase_succeeded", { productId, value, currency });
      } catch (err) {
        console.warn("[RC] post-purchase ad tracking failed:", err);
      }
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

  const lastPaywallErrorRef = useRef<string | null>(null);

  const ensureOfferingLoaded = useCallback(async (): Promise<boolean> => {
    if (offeringsQuery.data?.current) return true;
    if (!PurchasesModule || Platform.OS === "web") return false;
    try {
      const fresh = await PurchasesModule.getOfferings();
      if (fresh?.current) {
        queryClient.setQueryData(["revenuecat", "offerings"], fresh);
        return true;
      }
    } catch (err) {
      console.error("[RC] getOfferings refetch failed:", err);
    }
    return false;
  }, [offeringsQuery.data, queryClient]);

  const lastPaywallSourceRef = useRef<string | null>(null);

  const presentPaywall = useCallback(
    async (source: string = "unknown"): Promise<PaywallResult> => {
      lastPaywallErrorRef.current = null;
      lastPaywallSourceRef.current = source;
      logPaywallEvent("paywall_requested", { source, platform: Platform.OS });

      if (Platform.OS === "web") {
        lastPaywallErrorRef.current = "Web platform — paywall unavailable.";
        console.warn("[RC] Paywall UI unavailable on web");
        logPaywallEvent("paywall_not_presented", { source, reason: "web" });
        return "not_presented";
      }
      if (!isConfigured) {
        lastPaywallErrorRef.current =
          "RevenueCat SDK is not configured. The RevenueCat API key is missing from this build. Ask the developer to set EXPO_PUBLIC_REVENUECAT_IOS_API_KEY in EAS environment and rebuild.";
        console.warn("[RC] presentPaywall called before SDK configured");
        logPaywallEvent("paywall_error", { source, reason: "sdk_not_configured" });
        return "error";
      }

      const hasOffering = await ensureOfferingLoaded();
      if (!hasOffering) {
        lastPaywallErrorRef.current =
          "No current offering is configured in RevenueCat. Ask the developer to set a Current Offering in the RevenueCat dashboard for the iOS app.";
        console.warn("[RC] No current offering available to present");
        logPaywallEvent("paywall_error", { source, reason: "no_offering" });
        return "error";
      }

      logPaywallEvent("paywall_presented", { source });
      return new Promise<PaywallResult>((resolve) => {
        const previous = paywallResolveRef.current;
        paywallResolveRef.current = resolve;
        if (previous) {
          previous("cancelled");
        }
        setPaywallVisible(true);
      });
    },
    [ensureOfferingLoaded]
  );

  const handlePaywallClose = useCallback((result: PaywallResult) => {
    setPaywallVisible(false);
    const resolver = paywallResolveRef.current;
    paywallResolveRef.current = null;
    const source = lastPaywallSourceRef.current ?? "unknown";
    logPaywallEvent("paywall_closed", { source, result });
    if (result === "purchased" || result === "restored") {
      void queryClient.invalidateQueries({ queryKey: ["revenuecat", "customer-info"] });
    }
    if (resolver) resolver(result);
  }, [queryClient]);

  const getLastPaywallError = useCallback(() => lastPaywallErrorRef.current, []);

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
  const isSubscribedFromRC = !!customerInfo?.entitlements?.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER];
  const isSubscribedFromOverride = hasProOverride(userEmail);
  const isSubscribed = isSubscribedFromRC || isSubscribedFromOverride;

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
    getLastPaywallError,
    refetchCustomerInfo: customerInfoQuery.refetch,
    paywallVisible,
    handlePaywallClose,
  };
}

type SubscriptionContextValue = ReturnType<typeof useSubscriptionContext>;
const Context = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({
  children,
  userId,
  userEmail,
}: {
  children: React.ReactNode;
  userId?: string | null;
  userEmail?: string | null;
}) {
  const value = useSubscriptionContext(userId, userEmail);
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

  // Backstop: keep the server's Pro flag (users.is_pro / pro_expires_at) in sync
  // with RevenueCat so challenge participation + Pro counts work even before the
  // dashboard webhook is configured. Only runs on native where RC is the source
  // of truth — never downgrades from web (where customerInfo is unavailable).
  const syncStatusMutation = trpc.subscription.syncStatus.useMutation();
  const lastSyncRef = useRef<string>("");
  useEffect(() => {
    if (!userId) return;
    if (!value.isAvailable) return;
    if (value.customerInfo === undefined) return; // still loading
    const active = value.customerInfo?.entitlements?.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER];
    const isPro = !!active || hasProOverride(userEmail);
    const expRaw = active?.expirationDate ?? null;
    const parsed = expRaw ? Date.parse(expRaw) : NaN;
    const expiresAt = Number.isFinite(parsed) ? parsed : null;
    const sig = `${userId}|${isPro}|${expiresAt ?? ""}`;
    if (sig === lastSyncRef.current) return;
    lastSyncRef.current = sig;
    // Only nudge the server to re-verify; it re-checks the entitlement with
    // RevenueCat itself and never trusts a client-supplied Pro flag.
    syncStatusMutation.mutate(
      { userId },
      { onError: (err) => console.warn("[RC] syncStatus failed:", err.message) },
    );
  }, [userId, userEmail, value.isAvailable, value.customerInfo, syncStatusMutation]);

  return (
    <Context.Provider value={value}>
      {children}
      <CustomPaywallModal
        visible={value.paywallVisible}
        monthlyPackage={value.monthlyPackage}
        yearlyPackage={value.yearlyPackage}
        onClose={value.handlePaywallClose}
        onPurchase={value.purchase}
        onRestore={value.restore}
        verifyEntitlement={async () => {
          try {
            const fresh: any = await value.refetchCustomerInfo();
            const active = fresh?.data?.entitlements?.active;
            return !!active && Object.keys(active).length > 0;
          } catch {
            return false;
          }
        }}
      />
    </Context.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useSubscription must be used within a SubscriptionProvider");
  }
  return ctx;
}
