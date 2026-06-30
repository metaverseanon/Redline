import React, { useEffect } from "react";
import { Platform } from "react-native";
import type { PaywallResult } from "@/components/CustomPaywallModal";
import { useUser } from "@/providers/UserProvider";
import * as rc from "@/lib/revenuecat";

// Superwall public API keys. A single key is acceptable — if only one platform's
// key is provided we reuse it for the other so a one-key setup still works.
const SUPERWALL_IOS_API_KEY = process.env.EXPO_PUBLIC_SUPERWALL_IOS_API_KEY;
const SUPERWALL_ANDROID_API_KEY = process.env.EXPO_PUBLIC_SUPERWALL_ANDROID_API_KEY;

// Lazily-required native modules. Guarded by Platform so web / Expo Go (where the
// native module is absent) cleanly no-op and the rest of the app is untouched.
let SW: any = null;
let PurchasesModule: any = null;

if (Platform.OS !== "web") {
  try {
    SW = require("expo-superwall");
  } catch (err) {
    console.warn("[SW] expo-superwall native module unavailable:", err);
  }
  try {
    PurchasesModule = require("react-native-purchases").default;
  } catch (err) {
    console.warn("[SW] react-native-purchases unavailable:", err);
  }
}

const nativeAvailable = Platform.OS !== "web" && !!SW;

export function getSuperwallApiKeys(): { ios?: string; android?: string } | null {
  if (!nativeAvailable) return null;
  const ios = SUPERWALL_IOS_API_KEY || SUPERWALL_ANDROID_API_KEY;
  const android = SUPERWALL_ANDROID_API_KEY || SUPERWALL_IOS_API_KEY;
  if (!ios && !android) return null;
  return { ios, android };
}

/**
 * True when a Superwall key is present AND the native module is available. When
 * this is false the app behaves exactly as before (RevenueCat CustomPaywallModal).
 */
export function isSuperwallConfigured(): boolean {
  return getSuperwallApiKeys() !== null;
}

// ---------------------------------------------------------------------------
// Imperative bridge: lets the existing `presentPaywall(source)` (in revenuecat.tsx)
// drive a Superwall placement without that file needing Superwall hooks. The
// mounted <SuperwallBridge/> registers `registerFn`; until it is mounted,
// registerSuperwallPlacement returns null so the caller falls back to the RC modal.
// ---------------------------------------------------------------------------

type RegisterFn = (args: {
  placement: string;
  params?: Record<string, any>;
  feature?: () => void;
}) => Promise<void>;

let registerFn: RegisterFn | null = null;

// The single in-flight placement request. Each call to registerSuperwallPlacement
// mints a monotonically increasing `token`; `finish`, the safety timer, and the
// feature() grant are all scoped to that token, so a callback or timer belonging
// to a superseded request can never settle (or mis-settle) a newer one.
type ActiveRequest = {
  token: number;
  presented: boolean;
  onPresented: (() => void) | null;
  finish: (r: PaywallResult) => void;
};
let active: ActiveRequest | null = null;
let tokenSeq = 0;

function mapDismissResult(result: any): PaywallResult {
  const type = result?.type;
  if (type === "purchased") return "purchased";
  if (type === "restored") return "restored";
  // "declined", "failed", or anything unexpected => treat as a dismissal.
  return "cancelled";
}

export function SuperwallBridge() {
  const { registerPlacement } = SW.usePlacement({
    onPresent: () => {
      if (!active) return;
      active.presented = true;
      try {
        active.onPresented?.();
      } catch {}
    },
    onDismiss: (_info: any, result: any) => {
      active?.finish(mapDismissResult(result));
    },
    onSkip: () => {
      // Holdout / no audience match / already subscribed: no paywall was shown.
      active?.finish("not_presented");
    },
    onError: (error: string) => {
      console.warn("[SW] placement error:", error);
      active?.finish("error");
    },
  });

  useEffect(() => {
    registerFn = registerPlacement;
    return () => {
      if (registerFn === registerPlacement) registerFn = null;
    };
  }, [registerPlacement]);

  return null;
}

/**
 * Drive a Superwall placement. Resolves to a PaywallResult, or `null` when the
 * bridge is not mounted yet (caller should then fall back to the RC modal).
 */
export async function registerSuperwallPlacement(
  placement: string,
  opts?: { params?: Record<string, any>; onPresented?: () => void }
): Promise<PaywallResult | null> {
  const fn = registerFn;
  if (!fn) return null;

  // Single paywall at a time (mirrors the RC modal's single-instance assumption).
  // Settle the prior in-flight request before starting a new one.
  if (active) {
    const prev = active;
    active = null;
    prev.finish("cancelled");
  }

  const token = ++tokenSeq;

  return new Promise<PaywallResult>((resolve) => {
    let settled = false;
    let safetyTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (r: PaywallResult) => {
      if (settled) return;
      settled = true;
      // Only clear `active` if it still points at THIS request — a superseding
      // request may have already installed itself as the active one.
      if (active && active.token === token) active = null;
      if (safetyTimer) clearTimeout(safetyTimer);
      resolve(r);
    };

    const req: ActiveRequest = {
      token,
      presented: false,
      onPresented: opts?.onPresented ?? null,
      finish,
    };
    active = req;

    // The result is settled DETERMINISTICALLY by Superwall's callbacks — never by
    // a fixed time inference (which could race a paywall that presents slightly
    // later and drop a real purchase):
    //   onDismiss -> mapped result (purchased / restored / cancelled)
    //   onSkip    -> not_presented (holdout / no audience / already subscribed)
    //   onError   -> error
    //   feature() -> not_presented, but ONLY when no paywall was presented (access
    //                granted directly). If a paywall WAS presented, onDismiss
    //                reports the precise outcome, so feature is ignored here.
    // The safety timer only guards against a pathological SDK state where no
    // callback ever fires; it is minutes long so it can never interfere with real
    // user interaction. (Pro status would still activate via RC's own customerInfo
    // listener even in that edge case.)
    safetyTimer = setTimeout(
      () => finish(req.presented ? "cancelled" : "not_presented"),
      5 * 60 * 1000
    );

    fn({
      placement,
      params: opts?.params,
      feature: () => {
        if (!req.presented) finish("not_presented");
      },
    }).catch((err: any) => {
      console.warn("[SW] registerPlacement threw:", err);
      finish("error");
    });
  });
}

// Best-effort plan label from a StoreKit product id so Superwall-driven purchases
// segment in the funnel the same way RC's packageType (monthly/yearly) does.
function inferPlanType(productId: string): string {
  const id = productId.toLowerCase();
  if (id.includes("year") || id.includes("annual") || id.includes("12m")) return "yearly";
  if (id.includes("month") || id.includes("1m")) return "monthly";
  if (id.includes("week")) return "weekly";
  return productId || "unknown";
}

// ---------------------------------------------------------------------------
// Purchase controller: Superwall presents the paywall UI, but RevenueCat remains
// the purchase + entitlement backend. Reuses the exact ad-SDK / PostHog analytics
// helpers extracted from revenuecat.tsx so attribution parity is preserved.
// ---------------------------------------------------------------------------

async function onPurchase(
  params: any
): Promise<{ type: "cancelled" | "failed" | "purchased" | "pending"; error?: string }> {
  if (!PurchasesModule) return { type: "failed", error: "Purchases unavailable" };
  const productId = String(params?.productId ?? "");
  if (!productId) return { type: "failed", error: "Missing productId" };

  try {
    const CATS = PurchasesModule.PRODUCT_CATEGORY;
    let products: any[] = [];
    try {
      products = (await PurchasesModule.getProducts([productId], CATS?.SUBSCRIPTION)) ?? [];
      if (products.length === 0) {
        products = (await PurchasesModule.getProducts([productId], CATS?.NON_SUBSCRIPTION)) ?? [];
      }
    } catch {
      products = (await PurchasesModule.getProducts([productId])) ?? [];
    }

    const product = products.find((p: any) => p?.identifier === productId) ?? products[0];
    if (!product) return { type: "failed", error: `Product not found: ${productId}` };

    const planType = inferPlanType(productId);
    rc.recordSubscribeTapped({ product, planType, productId });

    const { customerInfo } = await PurchasesModule.purchaseStoreProduct(product);
    const active = customerInfo?.entitlements?.active ?? {};
    if (Object.keys(active).length > 0) {
      rc.recordSuccessfulPurchase({ product, planType, productId, customerInfo });
      return { type: "purchased" };
    }
    return { type: "cancelled" };
  } catch (err: any) {
    const cancelCode = PurchasesModule.PURCHASES_ERROR_CODE?.PURCHASE_CANCELLED_ERROR;
    if (err?.userCancelled || (cancelCode != null && err?.code === cancelCode)) {
      return { type: "cancelled" };
    }
    console.warn("[SW] onPurchase failed:", err);
    return { type: "failed", error: String(err?.message ?? err) };
  }
}

async function onPurchaseRestore(): Promise<{ type: "restored" | "failed"; error?: string }> {
  if (!PurchasesModule) return { type: "failed", error: "Purchases unavailable" };
  try {
    const customerInfo = await PurchasesModule.restorePurchases();
    const active = customerInfo?.entitlements?.active ?? {};
    return Object.keys(active).length > 0
      ? { type: "restored" }
      : { type: "failed", error: "No active subscriptions found" };
  } catch (err: any) {
    console.warn("[SW] onPurchaseRestore failed:", err);
    return { type: "failed", error: String(err?.message ?? err) };
  }
}

// ---------------------------------------------------------------------------
// Identity + subscription status sync. Keeps the Superwall user id === the app /
// RevenueCat user id, and mirrors RC's entitlement into Superwall (so Superwall
// gates correctly under the custom purchase controller).
// ---------------------------------------------------------------------------

function SuperwallSync() {
  const swUser = SW.useUser();
  const { user } = useUser();
  const subscription = rc.useSubscription();

  const userId = user?.id ?? null;
  useEffect(() => {
    if (userId) {
      void Promise.resolve(swUser.identify(userId)).catch((err: any) =>
        console.warn("[SW] identify failed:", err)
      );
    } else {
      void Promise.resolve(swUser.signOut?.()).catch(() => {});
    }
    // swUser identity is stable for the lifetime of the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const isSubscribed = subscription.isSubscribed;
  const customerInfo = subscription.customerInfo;
  useEffect(() => {
    if (customerInfo === undefined) return; // RC still loading
    try {
      if (isSubscribed) {
        const active = customerInfo?.entitlements?.active ?? {};
        const entitlements = Object.keys(active).map((id) => ({ id }));
        void Promise.resolve(
          swUser.setSubscriptionStatus({ status: "ACTIVE", entitlements })
        ).catch((err: any) => console.warn("[SW] setSubscriptionStatus ACTIVE failed:", err));
      } else {
        void Promise.resolve(
          swUser.setSubscriptionStatus({ status: "INACTIVE" })
        ).catch((err: any) => console.warn("[SW] setSubscriptionStatus INACTIVE failed:", err));
      }
    } catch (err) {
      console.warn("[SW] subscription status sync threw:", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSubscribed, customerInfo]);

  return null;
}

/**
 * Gate that mounts the Superwall provider tree only when configured. When NOT
 * configured (web / Expo Go / no key) it renders children unchanged, so the app's
 * existing RevenueCat behavior is byte-for-byte identical to before.
 *
 * SuperwallProvider renders its children unconditionally (it does not block on
 * SDK configuration), so wrapping the app tree here is safe and never delays
 * startup.
 */
export function SuperwallGate({ children }: { children: React.ReactNode }) {
  const keys = getSuperwallApiKeys();
  if (!keys || !SW) return <>{children}</>;

  const { SuperwallProvider, CustomPurchaseControllerProvider } = SW;
  return (
    <SuperwallProvider
      apiKeys={keys}
      onConfigurationError={(error: Error) =>
        console.warn("[SW] configuration error:", error?.message ?? error)
      }
    >
      <CustomPurchaseControllerProvider controller={{ onPurchase, onPurchaseRestore }}>
        <SuperwallBridge />
        <SuperwallSync />
        {children}
      </CustomPurchaseControllerProvider>
    </SuperwallProvider>
  );
}
