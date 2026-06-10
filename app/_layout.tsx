import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
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

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
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
    // Dev-only routes that should not trigger auth redirects
    const inDevRoute   = __DEV__ && segments[0] === 'dev-tools';

    async function redirect() {
      if (inDevRoute) return; // dev screen manages its own guard

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
  }, [session, loading, segments]);

  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      <Stack screenOptions={{ headerShown: false }} />
    </View>
  );
}
