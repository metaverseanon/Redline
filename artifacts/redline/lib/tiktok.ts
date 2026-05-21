import { Platform } from 'react-native';

const TIKTOK_APP_ID = process.env.EXPO_PUBLIC_TIKTOK_APP_ID;
const TIKTOK_ACCESS_TOKEN = process.env.EXPO_PUBLIC_TIKTOK_ACCESS_TOKEN;
const BUNDLE_ID = 'app.rork.redline-app';

let TikTokBusiness: any = null;
let TikTokEventName: any = null;
let TikTokContentEventName: any = null;

if (Platform.OS !== 'web') {
  try {
    const mod = require('react-native-tiktok-business-sdk');
    TikTokBusiness = mod.TikTokBusiness ?? mod.default;
    TikTokEventName = mod.TikTokEventName;
    TikTokContentEventName = mod.TikTokContentEventName;
  } catch (err) {
    console.warn('[TIKTOK] SDK native module not available (expected in Expo Go):', err);
  }
}

let initialized = false;
let initializing = false;
let initPromise: Promise<void> | null = null;

export async function initializeTikTok(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;
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
  initPromise = (async () => {
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

      const debug = __DEV__;
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
  })();
  return initPromise;
}

async function ensureReady(): Promise<boolean> {
  if (initialized) return true;
  if (initPromise) {
    await initPromise;
    return initialized;
  }
  await initializeTikTok();
  return initialized;
}

export async function tiktokIdentify(userId: string, email?: string | null): Promise<void> {
  const ready = await ensureReady();
  if (!ready || !TikTokBusiness) return;
  try {
    // identify(externalId, externalUserName, phoneNumber, email)
    await TikTokBusiness.identify(userId, '', '', email ?? '');
    console.log('[TIKTOK] identified user', userId);
  } catch (err) {
    console.warn('[TIKTOK] identify failed:', err);
  }
}

export async function tiktokTrackRegistration(): Promise<void> {
  const ready = await ensureReady();
  if (!ready || !TikTokBusiness || !TikTokEventName) return;
  try {
    // trackEvent(eventName, eventId?, properties?)
    await TikTokBusiness.trackEvent(TikTokEventName.REGISTRATION);
    console.log('[TIKTOK] tracked Registration');
  } catch (err) {
    console.warn('[TIKTOK] trackRegistration failed:', err);
  }
}

export async function tiktokTrackLogin(): Promise<void> {
  const ready = await ensureReady();
  if (!ready || !TikTokBusiness || !TikTokEventName) return;
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
  const ready = await ensureReady();
  if (!ready || !TikTokBusiness || !TikTokEventName) {
    console.warn('[TIKTOK] trackSubscribe skipped — SDK not ready', { ready, hasSdk: !!TikTokBusiness });
    return;
  }
  try {
    // trackEvent(eventName, eventId?, properties?) — properties must be 3rd arg, not 2nd.
    await TikTokBusiness.trackEvent(
      TikTokEventName.SUBSCRIBE,
      opts.orderId ?? null,
      {
        value: opts.value,
        currency: opts.currency,
        description: opts.productId,
      },
    );
    console.log('[TIKTOK] tracked Subscribe', opts);
    if (typeof TikTokBusiness.flush === 'function') {
      try { await TikTokBusiness.flush(); } catch {}
    }
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
  const ready = await ensureReady();
  if (!ready || !TikTokBusiness || !TikTokContentEventName) {
    console.warn('[TIKTOK] trackPurchase skipped — SDK not ready', { ready, hasSdk: !!TikTokBusiness });
    return;
  }
  try {
    // trackContentEvent(eventName, properties) — properties use UPPERCASE keys per SDK enum.
    await TikTokBusiness.trackContentEvent(TikTokContentEventName.PURCHASE, {
      VALUE: opts.value,
      CURRENCY: opts.currency,
      DESCRIPTION: opts.productId,
      ...(opts.orderId ? { ORDER_ID: opts.orderId } : {}),
      CONTENTS: [
        {
          CONTENT_ID: opts.productId,
          CONTENT_NAME: opts.productId,
          BRAND: 'RedLine',
          PRICE: opts.value,
          QUANTITY: 1,
        },
      ],
    });
    console.log('[TIKTOK] tracked Purchase', opts);
    if (typeof TikTokBusiness.flush === 'function') {
      try { await TikTokBusiness.flush(); } catch {}
    }
  } catch (err) {
    console.warn('[TIKTOK] trackPurchase failed:', err);
  }
}

export async function tiktokLogout(): Promise<void> {
  if (!initialized || !TikTokBusiness) return;
  try {
    if (typeof TikTokBusiness.logout === 'function') {
      await TikTokBusiness.logout();
      console.log('[TIKTOK] logged out');
    }
  } catch (err) {
    console.warn('[TIKTOK] logout failed:', err);
  }
}

export function isTikTokConfigured(): boolean {
  return initialized;
}
