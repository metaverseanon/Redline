import { Platform } from 'react-native';
import Constants from 'expo-constants';

const TIKTOK_APP_ID = process.env.EXPO_PUBLIC_TIKTOK_APP_ID;
const TIKTOK_ACCESS_TOKEN = process.env.EXPO_PUBLIC_TIKTOK_ACCESS_TOKEN;
const BUNDLE_ID = 'app.rork.redline-app';

let TikTokBusiness: any = null;
let TikTokEventName: any = null;
let TikTokContentEventName: any = null;

if (Platform.OS !== 'web') {
  try {
    const mod = require('react-native-tiktok-business-sdk');
    TikTokBusiness = mod.TikTokBusiness;
    TikTokEventName = mod.TikTokEventName;
    TikTokContentEventName = mod.TikTokContentEventName;
  } catch (err) {
    console.warn('[TIKTOK] SDK native module not available (expected in Expo Go):', err);
  }
}

let initialized = false;
let initializing = false;

export async function initializeTikTok(): Promise<void> {
  if (initialized || initializing) return;
  if (Platform.OS === 'web' || !TikTokBusiness) return;
  if (!TIKTOK_APP_ID) {
    console.warn('[TIKTOK] EXPO_PUBLIC_TIKTOK_APP_ID not set; skipping init');
    return;
  }
  if (!TIKTOK_ACCESS_TOKEN) {
    console.warn('[TIKTOK] EXPO_PUBLIC_TIKTOK_ACCESS_TOKEN not set; skipping init');
    return;
  }

  initializing = true;
  try {
    if (Platform.OS === 'ios') {
      try {
        const TT = require('expo-tracking-transparency');
        const current = await TT.getTrackingPermissionsAsync();
        if (current.status === 'undetermined') {
          const requested = await TT.requestTrackingPermissionsAsync();
          console.log('[TIKTOK] ATT permission:', requested.status);
        } else {
          console.log('[TIKTOK] ATT permission already:', current.status);
        }
      } catch (e) {
        console.warn('[TIKTOK] ATT request failed:', e);
      }
    }

    const debug = Constants.executionEnvironment !== 'standalone';
    await TikTokBusiness.initializeSdk(
      BUNDLE_ID,
      TIKTOK_APP_ID,
      TIKTOK_ACCESS_TOKEN,
      debug,
    );
    initialized = true;
    console.log('[TIKTOK] SDK initialized (debug=', debug, ')');
  } catch (err) {
    console.error('[TIKTOK] initialize failed:', err);
  } finally {
    initializing = false;
  }
}

export async function tiktokIdentify(userId: string, email?: string | null): Promise<void> {
  if (!initialized || !TikTokBusiness) return;
  try {
    await TikTokBusiness.identify(userId, email ?? '', '', '');
    console.log('[TIKTOK] identified user', userId);
  } catch (err) {
    console.warn('[TIKTOK] identify failed:', err);
  }
}

export async function tiktokTrackRegistration(): Promise<void> {
  if (!initialized || !TikTokBusiness || !TikTokEventName) return;
  try {
    await TikTokBusiness.trackEvent(TikTokEventName.REGISTRATION);
    console.log('[TIKTOK] tracked Registration');
  } catch (err) {
    console.warn('[TIKTOK] trackRegistration failed:', err);
  }
}

export async function tiktokTrackLogin(): Promise<void> {
  if (!initialized || !TikTokBusiness || !TikTokEventName) return;
  try {
    await TikTokBusiness.trackEvent(TikTokEventName.LOGIN);
    console.log('[TIKTOK] tracked Login');
  } catch (err) {
    console.warn('[TIKTOK] trackLogin failed:', err);
  }
}

export async function tiktokTrackSubscribe(opts: {
  value: number;
  currency: string;
  productId: string;
  orderId?: string;
}): Promise<void> {
  if (!initialized || !TikTokBusiness || !TikTokEventName) return;
  try {
    await TikTokBusiness.trackEvent(TikTokEventName.SUBSCRIBE, {
      value: opts.value,
      currency: opts.currency,
      description: opts.productId,
      ...(opts.orderId ? { order_id: opts.orderId } : {}),
    });
    console.log('[TIKTOK] tracked Subscribe', opts);
  } catch (err) {
    console.warn('[TIKTOK] trackSubscribe failed:', err);
  }
}

export async function tiktokTrackPurchase(opts: {
  value: number;
  currency: string;
  productId: string;
  orderId?: string;
}): Promise<void> {
  if (!initialized || !TikTokBusiness || !TikTokContentEventName) return;
  try {
    await TikTokBusiness.trackContentEvent(TikTokContentEventName.PURCHASE, {
      value: opts.value,
      currency: opts.currency,
      description: opts.productId,
      ...(opts.orderId ? { order_id: opts.orderId } : {}),
      contents: {
        price: opts.value,
        quantity: 1,
        content_type: 'product',
        content_id: opts.productId,
        brand: 'RedLine',
        content_name: opts.productId,
      },
    });
    console.log('[TIKTOK] tracked Purchase', opts);
  } catch (err) {
    console.warn('[TIKTOK] trackPurchase failed:', err);
  }
}

export function isTikTokConfigured(): boolean {
  return initialized;
}
