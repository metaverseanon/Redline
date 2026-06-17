import { Platform } from 'react-native';

// Meta (Facebook) App Events SDK wrapper — the Meta equivalent of lib/tiktok.ts.
// Powers install attribution + standard conversion events (Registration,
// CompleteTutorial, Subscribe, Purchase) for Meta Ads. App ID + Client Token are
// baked into the native build via the react-native-fbsdk-next config plugin in
// app.json; the env vars below are optional runtime overrides and let the wrapper
// configure the SDK explicitly before init.
const FACEBOOK_APP_ID = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID;
const FACEBOOK_CLIENT_TOKEN = process.env.EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN;

// Meta standard mobile App Event names (internal SDK constants).
const EVENT_COMPLETE_REGISTRATION = 'fb_mobile_complete_registration';
const EVENT_COMPLETE_TUTORIAL = 'fb_mobile_tutorial_completion';
const EVENT_SUBSCRIBE = 'Subscribe';

let Settings: any = null;
let AppEventsLogger: any = null;

if (Platform.OS !== 'web') {
  try {
    const mod = require('react-native-fbsdk-next');
    Settings = mod.Settings ?? mod.default?.Settings ?? null;
    AppEventsLogger = mod.AppEventsLogger ?? mod.default?.AppEventsLogger ?? null;
  } catch (err) {
    console.warn('[META] SDK native module not available (expected in Expo Go):', err);
  }
}

let initialized = false;
let initPromise: Promise<void> | null = null;

export async function initializeMeta(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;
  if (Platform.OS === 'web' || !Settings) return;

  initPromise = (async () => {
    try {
      // Optional runtime config overrides (native plugin config is the source of
      // truth, but setting these guarantees init even if autoInit is disabled).
      if (FACEBOOK_APP_ID && typeof Settings.setAppID === 'function') {
        Settings.setAppID(FACEBOOK_APP_ID);
      }
      if (FACEBOOK_CLIENT_TOKEN && typeof Settings.setClientToken === 'function') {
        Settings.setClientToken(FACEBOOK_CLIENT_TOKEN);
      }

      // iOS 14+ requires ATT before advertiser tracking can be enabled. Reuse the
      // same expo-tracking-transparency prompt TikTok uses; whichever runs first
      // shows the dialog, the other reads the already-resolved status.
      let trackingGranted = Platform.OS !== 'ios';
      if (Platform.OS === 'ios') {
        try {
          const TT = require('expo-tracking-transparency');
          const current = await TT.getTrackingPermissionsAsync();
          let status = current.status;
          if (status === 'undetermined') {
            const requested = await TT.requestTrackingPermissionsAsync();
            status = requested.status;
          }
          trackingGranted = status === 'granted';
          console.log('[META] ATT permission:', status);
        } catch (e) {
          console.warn('[META] ATT request failed:', e);
        }
      }

      if (typeof Settings.setAdvertiserTrackingEnabled === 'function') {
        try {
          await Settings.setAdvertiserTrackingEnabled(trackingGranted);
        } catch (e) {
          console.warn('[META] setAdvertiserTrackingEnabled failed:', e);
        }
      }
      if (typeof Settings.setAdvertiserIDCollectionEnabled === 'function') {
        Settings.setAdvertiserIDCollectionEnabled(true);
      }

      Settings.initializeSDK();
      initialized = true;
      console.log('[META] SDK initialized (advertiserTracking=', trackingGranted, ')');
    } catch (err) {
      console.error('[META] initialize failed:', err);
    }
  })();
  return initPromise;
}

async function ensureReady(): Promise<boolean> {
  if (initialized) return true;
  if (initPromise) {
    await initPromise;
    return initialized;
  }
  await initializeMeta();
  return initialized;
}

export async function metaIdentify(userId: string, email?: string | null): Promise<void> {
  const ready = await ensureReady();
  if (!ready || !AppEventsLogger) return;
  try {
    if (typeof AppEventsLogger.setUserID === 'function') {
      AppEventsLogger.setUserID(userId);
    }
    if (email && typeof AppEventsLogger.setUserData === 'function') {
      AppEventsLogger.setUserData({ email });
    }
    console.log('[META] identified user', userId);
  } catch (err) {
    console.warn('[META] identify failed:', err);
  }
}

export async function metaTrackRegistration(): Promise<void> {
  const ready = await ensureReady();
  if (!ready || !AppEventsLogger) return;
  try {
    AppEventsLogger.logEvent(EVENT_COMPLETE_REGISTRATION);
    console.log('[META] tracked CompleteRegistration');
  } catch (err) {
    console.warn('[META] trackRegistration failed:', err);
  }
}

export async function metaTrackCompleteTutorial(): Promise<void> {
  const ready = await ensureReady();
  if (!ready || !AppEventsLogger) {
    console.warn('[META] trackCompleteTutorial skipped — SDK not ready', { ready, hasSdk: !!AppEventsLogger });
    return;
  }
  try {
    AppEventsLogger.logEvent(EVENT_COMPLETE_TUTORIAL);
    console.log('[META] tracked CompleteTutorial');
    if (typeof AppEventsLogger.flush === 'function') {
      try { AppEventsLogger.flush(); } catch {}
    }
  } catch (err) {
    console.warn('[META] trackCompleteTutorial failed:', err);
  }
}

export async function metaTrackSubscribe(opts: {
  value: number;
  currency: string;
  productId: string;
  productName?: string;
  orderId?: string;
}): Promise<void> {
  const ready = await ensureReady();
  if (!ready || !AppEventsLogger) {
    console.warn('[META] trackSubscribe skipped — SDK not ready', { ready, hasSdk: !!AppEventsLogger });
    return;
  }
  try {
    // logEvent(eventName, valueToSum, parameters)
    AppEventsLogger.logEvent(EVENT_SUBSCRIBE, opts.value, {
      fb_currency: opts.currency,
      fb_content_id: opts.productId,
      fb_description: opts.productName ?? opts.productId,
      ...(opts.orderId ? { fb_order_id: opts.orderId } : {}),
    });
    console.log('[META] tracked Subscribe', opts);
    if (typeof AppEventsLogger.flush === 'function') {
      try { AppEventsLogger.flush(); } catch {}
    }
  } catch (err) {
    console.warn('[META] trackSubscribe failed:', err);
  }
}

export async function metaTrackPurchase(opts: {
  value: number;
  currency: string;
  productId: string;
  orderId?: string;
}): Promise<void> {
  const ready = await ensureReady();
  if (!ready || !AppEventsLogger) {
    console.warn('[META] trackPurchase skipped — SDK not ready', { ready, hasSdk: !!AppEventsLogger });
    return;
  }
  try {
    // logPurchase(purchaseAmount, currency, parameters) → standard fb_mobile_purchase
    AppEventsLogger.logPurchase(opts.value, opts.currency, {
      fb_content_id: opts.productId,
      fb_content_type: 'product',
      ...(opts.orderId ? { fb_order_id: opts.orderId } : {}),
    });
    console.log('[META] tracked Purchase', opts);
    if (typeof AppEventsLogger.flush === 'function') {
      try { AppEventsLogger.flush(); } catch {}
    }
  } catch (err) {
    console.warn('[META] trackPurchase failed:', err);
  }
}

export async function metaLogout(): Promise<void> {
  if (!initialized || !AppEventsLogger) return;
  try {
    if (typeof AppEventsLogger.clearUserID === 'function') {
      AppEventsLogger.clearUserID();
      console.log('[META] cleared user');
    }
  } catch (err) {
    console.warn('[META] logout failed:', err);
  }
}

export function isMetaConfigured(): boolean {
  return initialized;
}
