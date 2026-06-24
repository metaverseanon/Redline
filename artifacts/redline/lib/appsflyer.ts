import { Platform } from 'react-native';

// AppsFlyer event wrapper — the AppsFlyer equivalent of lib/tiktok.ts and
// lib/meta.ts. The SDK is initialized once via initializeAppsFlyer() (called at
// app boot in app/_layout.tsx). Every in-app event awaits ensureReady() FIRST,
// exactly like lib/tiktok.ts, so events fired moments after launch (e.g. the
// onboarding paywall, which presents ~1.5s in) are NOT dropped before the SDK
// has started. AppsFlyer delays its start until ATT resolves
// (timeToWaitForATTUserAuthorization), so without this gate early Subscribe /
// Purchase events were logged before the SDK could forward them and were lost.
// Native module is lazily required so web and Expo Go cleanly no-op.

let appsFlyer: any = null;

if (Platform.OS !== 'web') {
  try {
    appsFlyer = require('react-native-appsflyer').default;
  } catch (err) {
    console.warn('[APPSFLYER] Native module not available (expected in Expo Go):', err);
  }
}

const AF_DEV_KEY = process.env.EXPO_PUBLIC_APPSFLYER_DEV_KEY ?? 'FPDaeC6wQQ2zNXbRLgberm';
const AF_APP_ID = process.env.EXPO_PUBLIC_APPSFLYER_APP_ID ?? '6758342404';

// AppsFlyer standard (recommended) in-app event names + parameter keys.
const AF_EVENT_SUBSCRIBE = 'af_subscribe';
const AF_EVENT_PURCHASE = 'af_purchase';

let initSettled = false;
let initSucceeded = false;
let initPromise: Promise<void> | null = null;
let pendingCustomerUserId: string | null = null;

// Initialize the AppsFlyer SDK once. Resolves when init settles (success,
// error, or a safety timeout) so event calls never hang forever. The success
// callback is AppsFlyer's conversion-data (GCD) listener — its arrival confirms
// the SDK has started, which is the moment in-app events become deliverable.
export function initializeAppsFlyer(): Promise<void> {
  if (initSettled) return Promise.resolve();
  if (initPromise) return initPromise;
  if (Platform.OS === 'web' || !appsFlyer) {
    initSettled = true;
    return Promise.resolve();
  }

  initPromise = new Promise<void>((resolve) => {
    let done = false;
    const settle = () => {
      if (done) return;
      done = true;
      initSettled = true;
      resolve();
    };
    // ATT wait is up to 10s; allow a little more before giving up so events are
    // attempted rather than blocked indefinitely if the GCD callback never fires.
    const timeout = setTimeout(() => {
      console.warn('[APPSFLYER] Init callback not received within timeout; proceeding');
      settle();
    }, 13000);

    try {
      // Set the customer user id BEFORE init when it's already known so the
      // first session/install attributes to the right user.
      if (pendingCustomerUserId && typeof appsFlyer.setCustomerUserId === 'function') {
        try {
          appsFlyer.setCustomerUserId(pendingCustomerUserId);
        } catch (err) {
          console.warn('[APPSFLYER] setCustomerUserId (pre-init) failed:', err);
        }
      }
      appsFlyer.initSdk(
        {
          devKey: AF_DEV_KEY,
          isDebug: false,
          appId: AF_APP_ID,
          onInstallConversionDataListener: true,
          onDeepLinkListener: true,
          timeToWaitForATTUserAuthorization: 10,
        },
        (result: Record<string, unknown>) => {
          console.log('[APPSFLYER] Init success:', result);
          initSucceeded = true;
          clearTimeout(timeout);
          settle();
        },
        (error: Record<string, unknown>) => {
          console.error('[APPSFLYER] Init error:', error);
          clearTimeout(timeout);
          settle();
        },
      );
    } catch (err) {
      console.warn('[APPSFLYER] initSdk threw:', err);
      clearTimeout(timeout);
      settle();
    }
  });

  return initPromise;
}

async function ensureReady(): Promise<boolean> {
  if (Platform.OS === 'web' || !appsFlyer) return false;
  if (initSettled) return true;
  if (initPromise) {
    await initPromise;
    return !!appsFlyer;
  }
  await initializeAppsFlyer();
  return !!appsFlyer;
}

function logEvent(eventName: string, values: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    if (Platform.OS === 'web' || !appsFlyer) {
      resolve();
      return;
    }
    // Wait for the SDK to finish starting before logging, so events fired right
    // after launch (onboarding paywall) are not dropped before the SDK is ready.
    void ensureReady().then((ready) => {
      if (!ready || typeof appsFlyer.logEvent !== 'function') {
        resolve();
        return;
      }
      // Surface init state so a true forwarding failure can be told apart from
      // an init failure when reading TestFlight/device logs.
      if (!initSucceeded) {
        console.warn(`[APPSFLYER] logging ${eventName} but SDK init did not confirm success (initSettled=${initSettled}); event may be dropped`);
      }
      try {
        appsFlyer.logEvent(
          eventName,
          values,
          () => {
            console.log(`[APPSFLYER] tracked ${eventName} (initSucceeded=${initSucceeded})`, values);
            resolve();
          },
          (err: unknown) => {
            console.warn(`[APPSFLYER] ${eventName} failed (initSucceeded=${initSucceeded}):`, err);
            resolve();
          },
        );
      } catch (err) {
        console.warn(`[APPSFLYER] ${eventName} threw:`, err);
        resolve();
      }
    });
  });
}

// Tie AppsFlyer's Customer User ID to the backend/RevenueCat user id so events
// and revenue attribute to the same person across reinstalls. Stored as the
// pending id too so a pre-init call is applied when the SDK initializes.
export function appsflyerSetCustomerUserId(userId: string): void {
  if (Platform.OS === 'web' || !appsFlyer) return;
  pendingCustomerUserId = userId;
  try {
    if (typeof appsFlyer.setCustomerUserId === 'function') {
      appsFlyer.setCustomerUserId(userId);
      console.log('[APPSFLYER] set customer user id', userId);
    }
  } catch (err) {
    console.warn('[APPSFLYER] setCustomerUserId failed:', err);
  }
}

export async function appsflyerTrackSubscribe(opts: {
  value: number;
  currency: string;
  productId: string;
  productName?: string;
  quantity?: number;
  orderId?: string;
}): Promise<void> {
  await logEvent(AF_EVENT_SUBSCRIBE, {
    af_revenue: opts.value,
    af_currency: opts.currency,
    af_content_id: opts.productId,
    af_description: opts.productName ?? opts.productId,
    af_quantity: opts.quantity ?? 1,
    ...(opts.orderId ? { af_order_id: opts.orderId } : {}),
  });
}

export async function appsflyerTrackPurchase(opts: {
  value: number;
  currency: string;
  productId: string;
  orderId?: string;
}): Promise<void> {
  await logEvent(AF_EVENT_PURCHASE, {
    af_revenue: opts.value,
    af_currency: opts.currency,
    af_content_id: opts.productId,
    af_content_type: 'product',
    af_quantity: 1,
    ...(opts.orderId ? { af_order_id: opts.orderId } : {}),
  });
}
