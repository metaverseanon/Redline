import type { UserProfile } from '@/types/user';

const SYNTHETIC_APPLE_EMAIL = /^apple_.+@privaterelay\.appleid\.com$/i;

export function isSyntheticAppleEmail(email?: string | null): boolean {
  return !!email && SYNTHETIC_APPLE_EMAIL.test(email.trim());
}

export function getDisplayEmail(
  user?: Pick<UserProfile, 'email' | 'appleEmail'> | null,
): string {
  if (!user) return '';
  if (user.appleEmail && user.appleEmail.trim()) return user.appleEmail.trim();
  if (isSyntheticAppleEmail(user.email)) return '';
  return user.email ?? '';
}
