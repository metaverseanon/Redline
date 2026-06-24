import React from 'react';
import { Platform } from 'react-native';

const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

let client: any = null;
let triedInit = false;

function isEnabled(): boolean {
  return Platform.OS !== 'web' && !!POSTHOG_API_KEY;
}

function getClient(): any {
  if (!isEnabled()) return null;
  if (client) return client;
  if (triedInit) return client;
  triedInit = true;
  try {
    const PostHog = require('posthog-react-native').default;
    client = new PostHog(POSTHOG_API_KEY as string, { host: POSTHOG_HOST });
  } catch (e) {
    console.warn('[POSTHOG] init failed:', (e as any)?.message ?? e);
    client = null;
  }
  return client;
}

export function initializePostHog(): void {
  getClient();
}

export function posthogIdentify(userId: string, email?: string | null): void {
  const c = getClient();
  if (!c) return;
  try {
    c.identify(userId, email ? { email } : undefined);
  } catch (e) {
    console.warn('[POSTHOG] identify failed:', (e as any)?.message ?? e);
  }
}

export function posthogCapture(event: string, properties?: Record<string, unknown>): void {
  const c = getClient();
  if (!c) return;
  try {
    c.capture(event, properties);
  } catch (e) {
    console.warn('[POSTHOG] capture failed:', (e as any)?.message ?? e);
  }
}

export function posthogReset(): void {
  const c = getClient();
  if (!c) return;
  try {
    c.reset();
  } catch (e) {
    console.warn('[POSTHOG] reset failed:', (e as any)?.message ?? e);
  }
}

export function PostHogAppProvider({ children }: { children: React.ReactNode }) {
  const c = getClient();
  if (!c) return <>{children}</>;
  try {
    const { PostHogProvider } = require('posthog-react-native');
    return (
      <PostHogProvider
        client={c}
        autocapture={{
          captureTouches: true,
          captureLifecycleEvents: true,
          captureScreens: false,
        }}
      >
        {children}
      </PostHogProvider>
    );
  } catch (e) {
    console.warn('[POSTHOG] provider failed:', (e as any)?.message ?? e);
    return <>{children}</>;
  }
}
