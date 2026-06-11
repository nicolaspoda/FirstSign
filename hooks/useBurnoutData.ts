import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { Profile, Assessment, Checkin } from '@/types/database';

export interface BurnoutData {
  profile: Profile | null;
  latestAssessment: Assessment | null;
  previousAssessment: Assessment | null;
  recentCheckins: Checkin[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

interface CachePayload {
  profile: Profile | null;
  latestAssessment: Assessment | null;
  previousAssessment: Assessment | null;
  recentCheckins: Checkin[];
  cachedAt: number;
}

const CACHE_PREFIX = 'burnout_data_';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RECENT_CHECKINS_LIMIT = 12;

async function fetchFromSupabase(userId: string): Promise<CachePayload> {
  const [profileRes, assessmentRes, checkinsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
    supabase
      .from('assessments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(2),
    supabase
      .from('checkins')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(RECENT_CHECKINS_LIMIT),
  ]);

  if (profileRes.error)    throw profileRes.error;
  if (assessmentRes.error) throw assessmentRes.error;
  if (checkinsRes.error)   throw checkinsRes.error;

  const assessments = (assessmentRes.data ?? []) as Assessment[];

  return {
    profile:             (profileRes.data ?? null) as Profile | null,
    latestAssessment:    assessments[0] ?? null,
    previousAssessment:  assessments[1] ?? null,
    recentCheckins:      ((checkinsRes.data ?? []) as Checkin[]),
    cachedAt: Date.now(),
  };
}

async function readCache(key: string): Promise<CachePayload | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachePayload;
    if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(key: string, payload: CachePayload): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Non-fatal — app works without cache
  }
}

// Drop the cached snapshot for a user so the next mount of useBurnoutData
// fetches fresh data instead of briefly showing stale state (e.g. right
// after a new assessment was saved from the onboarding flow).
export async function clearBurnoutCache(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${CACHE_PREFIX}${userId}`);
  } catch {
    // Non-fatal — app works without cache
  }
}

export function useBurnoutData(): BurnoutData {
  const { user } = useAuth();

  const [profile,             setProfile]             = useState<Profile | null>(null);
  const [latestAssessment,    setLatestAssessment]    = useState<Assessment | null>(null);
  const [previousAssessment,  setPreviousAssessment]  = useState<Assessment | null>(null);
  const [recentCheckins,      setRecentCheckins]      = useState<Checkin[]>([]);
  const [loading,             setLoading]             = useState(true);
  const [error,               setError]               = useState<Error | null>(null);

  const cacheKey = user ? `${CACHE_PREFIX}${user.id}` : null;

  const applyPayload = useCallback((payload: CachePayload) => {
    setProfile(payload.profile);
    setLatestAssessment(payload.latestAssessment);
    setPreviousAssessment(payload.previousAssessment);
    setRecentCheckins(payload.recentCheckins);
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    if (!user || !cacheKey) return;
    setError(null);
    try {
      const fresh = await fetchFromSupabase(user.id);
      applyPayload(fresh);
      await writeCache(cacheKey, fresh);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Erreur lors du chargement des données'));
    }
  }, [user, cacheKey, applyPayload]);

  useEffect(() => {
    if (!user || !cacheKey) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const userId = user.id;
    const key = cacheKey;

    async function load() {
      // Show cached data immediately if still fresh
      const cached = await readCache(key);
      if (cached && !cancelled) {
        applyPayload(cached);
        setLoading(false);
      }

      // Always sync from Supabase in background
      try {
        const fresh = await fetchFromSupabase(userId);
        if (!cancelled) {
          applyPayload(fresh);
          await writeCache(key, fresh);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Erreur lors du chargement des données'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [user?.id, cacheKey, applyPayload]);

  // Re-sync from Supabase whenever the screen regains focus (e.g. coming back
  // from the onboarding flow after a new assessment, or from dev-tools after
  // simulating data).
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  return { profile, latestAssessment, previousAssessment, recentCheckins, loading, error, refresh };
}
