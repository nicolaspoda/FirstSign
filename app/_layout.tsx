import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as Linking from 'expo-linking';
import { Session } from '@supabase/supabase-js';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';
import { initSubscription } from '@/lib/subscription';

function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsOffline(state.isConnected === false);
    });
    return unsub;
  }, []);

  if (!isOffline) return null;

  return (
    <View style={bannerStyles.container}>
      <Text style={bannerStyles.text}>Pas de connexion internet</Text>
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  container: {
    backgroundColor: '#374151',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
  },
});

function parseUrlFragment(url: string): Record<string, string> {
  const hash = url.split('#')[1] ?? '';
  const result: Record<string, string> = {};
  hash.split('&').forEach((pair) => {
    const [k, v] = pair.split('=');
    if (k) result[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
  });
  return result;
}

async function handlePasswordResetUrl(url: string): Promise<boolean> {
  if (!url.includes('reset-password')) return false;

  // PKCE flow: code in query params
  const parsed = Linking.parse(url);
  const code = parsed.queryParams?.code;
  if (typeof code === 'string') {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return !error;
  }

  // Implicit flow: tokens in URL fragment
  const fragment = parseUrlFragment(url);
  if (fragment.type === 'recovery' && fragment.access_token) {
    const { error } = await supabase.auth.setSession({
      access_token: fragment.access_token,
      refresh_token: fragment.refresh_token ?? '',
    });
    return !error;
  }

  return false;
}

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const router = useRouter();
  const segments = useSegments();
  // Prevent double-navigation on first render
  const hasRedirected = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function init() {
      // Process initial deep link and capture result synchronously so
      // recoveryMode and loading flip in the same React render batch.
      let isRecovery = false;
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl && mounted) {
          isRecovery = await handlePasswordResetUrl(initialUrl);
        }
      } catch {}

      const { data: { session: s } } = await supabase.auth.getSession();
      if (mounted) {
        if (isRecovery) setRecoveryMode(true);
        setSession(s);
        setLoading(false);
      }
    }

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (!mounted) return;
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
      }
      if (event === 'USER_UPDATED' || event === 'SIGNED_OUT') {
        setRecoveryMode(false);
      }
    });

    // Handle deep links while the app is already running
    const linkSub = Linking.addEventListener('url', ({ url }) => {
      handlePasswordResetUrl(url);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      linkSub.remove();
    };
  }, []);

  // Initialize RevenueCat once session is confirmed (native only — web returns early)
  useEffect(() => {
    if (!loading && session?.user) {
      initSubscription(session.user.id);
    }
  }, [session, loading]);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup  = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';
    const inTabs       = segments[0] === '(tabs)';
    const inDevRoute   = __DEV__ && segments[0] === 'dev-tools';
    const inStandaloneRoute = segments[0] === 'exercises' || segments[0] === 'b2b';

    const onResetPassword = inAuthGroup && (segments as string[])[1] === 'reset-password';

    async function redirect() {
      if (inDevRoute || inStandaloneRoute) return;

      // reset-password manages its own navigation after submit — never redirect away
      if (onResetPassword) return;

      // Password recovery: navigate to reset-password if not already there
      if (recoveryMode) {
        router.replace('/(auth)/reset-password');
        return;
      }

      if (!session) {
        if (!inAuthGroup && !inOnboarding) {
          router.replace('/(onboarding)/welcome');
        }
        return;
      }

      if (inAuthGroup || (!inTabs && !inOnboarding)) {
        const { data, error } = await supabase
          .from('assessments')
          .select('id')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (!error && data && data.length > 0) {
          router.replace('/(tabs)');
        } else {
          router.replace('/(onboarding)/assessment');
        }
      }
    }

    redirect();
  }, [session, loading, segments, recoveryMode]);

  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      <Stack screenOptions={{ headerShown: false }} />
    </View>
  );
}
