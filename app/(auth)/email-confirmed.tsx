import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

export default function EmailConfirmedScreen() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    async function syncNames() {
      try {
        const stored = await AsyncStorage.getItem('pending_user_names');
        if (!stored) return;
        const { first_name, last_name } = JSON.parse(stored) as Record<string, string>;
        if (!first_name && !last_name) return;
        await supabase
          .from('profiles')
          .update({ first_name: first_name || null, last_name: last_name || null })
          .eq('user_id', user!.id);
        await AsyncStorage.removeItem('pending_user_names');
      } catch (e) {
        console.error('[email-confirmed] syncNames error:', e);
      }
    }
    syncNames();
  }, [user]);

  async function handleContinue() {
    if (!user) {
      router.replace('/(auth)/login');
      return;
    }
    const { data } = await supabase
      .from('assessments')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    if (data && data.length > 0) {
      router.replace('/(tabs)');
    } else {
      router.replace('/(onboarding)/assessment');
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="checkmark-circle" size={64} color={Colors.primary} />
        </View>
        <Text style={styles.title}>Email confirmé !</Text>
        <Text style={styles.body}>
          Votre adresse email a bien été vérifiée.{'\n'}Votre compte est maintenant actif.
        </Text>
        <TouchableOpacity style={styles.button} onPress={handleContinue}>
          <Text style={styles.buttonText}>Accéder à l'application</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
