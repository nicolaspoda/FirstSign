import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import type { SubscriptionTier } from '@/types/database';

export type Feature =
  | 'assessment'
  | 'checkin_2weeks'
  | 'ai_3messages'
  | 'checkin_history'
  | 'ai_unlimited'
  | 'action_plan'
  | 'exercises';

const FEATURES_BY_TIER: Record<SubscriptionTier, Feature[]> = {
  free:    ['assessment', 'checkin_2weeks', 'ai_3messages'],
  premium: ['assessment', 'checkin_2weeks', 'ai_3messages', 'checkin_history', 'ai_unlimited', 'action_plan', 'exercises'],
};

const REVENUECAT_KEY = process.env.EXPO_PUBLIC_REVENUECAT_KEY ?? '';
const PREMIUM_ENTITLEMENT = 'premium';

// RevenueCat's native store isn't available in Expo Go and logs a console.error
// (visible as a red box) as soon as configure()/getCustomerInfo() are called —
// so it must not be touched at all in that environment.
export const isExpoGo = Constants.appOwnership === 'expo';

let initialized = false;

export function initSubscription(appUserID?: string): void {
  if (Platform.OS === 'web' || isExpoGo) {
    initialized = true;
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Purchases = require('react-native-purchases').default;
    Purchases.configure({ apiKey: REVENUECAT_KEY, appUserID });
  } catch {
    // Subscription checks fall back to the DB if configuration fails
  } finally {
    initialized = true;
  }
}

function ensureInitialized(): void {
  if (initialized || Platform.OS === 'web' || isExpoGo) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Purchases = require('react-native-purchases').default;
    Purchases.configure({ apiKey: REVENUECAT_KEY });
  } catch {
    // Subscription checks fall back to the DB if configuration fails
  } finally {
    initialized = true;
  }
}

async function checkSubscriptionFromDB(): Promise<SubscriptionTier> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 'free';
    const { data } = await supabase
      .from('profiles')
      .select('subscription_tier')
      .eq('user_id', user.id)
      .maybeSingle();
    return (data?.subscription_tier as SubscriptionTier) ?? 'free';
  } catch {
    return 'free';
  }
}

export async function checkSubscription(): Promise<SubscriptionTier> {
  // Web et Expo Go: RevenueCat n'est pas disponible — lit le tier depuis la DB (profiles table)
  if (Platform.OS === 'web' || isExpoGo) return checkSubscriptionFromDB();

  try {
    ensureInitialized();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Purchases = require('react-native-purchases').default;
    const customerInfo = await Purchases.getCustomerInfo();
    const isPremium = PREMIUM_ENTITLEMENT in customerInfo.entitlements.active;
    return isPremium ? 'premium' : 'free';
  } catch {
    return 'free';
  }
}

export async function canAccess(feature: Feature): Promise<boolean> {
  const tier = await checkSubscription();
  return FEATURES_BY_TIER[tier].includes(feature);
}

export function getFeaturesForTier(tier: SubscriptionTier): Feature[] {
  return FEATURES_BY_TIER[tier];
}
