import { Platform } from 'react-native';

// AppsFlyer event wrapper — the AppsFlyer equivalent of lib/tiktok.ts and
// lib/meta.ts. The SDK is initialized once at app boot in app/_layout.tsx
// (appsFlyer.initSdk). This module only logs in-app conversion events so that
// AppsFlyer receives Subscribe / Purchase from the RevenueCat purchase flow.
// Native module is lazily required so web and Expo Go cleanly no-op.

let appsFlyer: any = null;

if (Platform.OS !== 'web') {
  try {
    appsFlyer = require('react-native-appsflyer').default;
  } catch (err) {
    console.warn('[APPSFLYER] Native module not available (expected in Expo Go):', err);
  }
}

// AppsFlyer standard (recommended) in-app event names + parameter keys.
const AF_EVENT_SUBSCRIBE = 'af_subscribe';
const AF_EVENT_PURCHASE = 'af_purchase';

function logEvent(eventName: string, values: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    if (Platform.OS === 'web' || !appsFlyer || typeof appsFlyer.logEvent !== 'function') {
      resolve();
      return;
    }
    try {
      appsFlyer.logEvent(
        eventName,
        values,
        () => {
          console.log(`[APPSFLYER] tracked ${eventName}`, values);
          resolve();
        },
        (err: unknown) => {
          console.warn(`[APPSFLYER] ${eventName} failed:`, err);
          resolve();
        },
      );
    } catch (err) {
      console.warn(`[APPSFLYER] ${eventName} threw:`, err);
      resolve();
    }
  });
}

// Tie AppsFlyer's Customer User ID to the backend/RevenueCat user id so events
// and revenue attribute to the same person across reinstalls.
export function appsflyerSetCustomerUserId(userId: string): void {
  if (Platform.OS === 'web' || !appsFlyer) return;
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
