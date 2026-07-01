import { useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { Colors } from '@/constants/colors';

export default function WelcomeScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const headerOpacity = useSharedValue(0);
  const headerTranslateY = useSharedValue(30);
  const subtitleOpacity = useSharedValue(0);
  const subtitleTranslateY = useSharedValue(20);
  const badgesOpacity = useSharedValue(0);
  const ctaOpacity = useSharedValue(0);
  const ctaTranslateY = useSharedValue(20);

  useEffect(() => {
    const easing = Easing.out(Easing.cubic);
    headerOpacity.value = withDelay(100, withTiming(1, { duration: 600, easing }));
    headerTranslateY.value = withDelay(100, withTiming(0, { duration: 600, easing }));
    subtitleOpacity.value = withDelay(300, withTiming(1, { duration: 600, easing }));
    subtitleTranslateY.value = withDelay(300, withTiming(0, { duration: 600, easing }));
    badgesOpacity.value = withDelay(500, withTiming(1, { duration: 500, easing }));
    ctaOpacity.value = withDelay(650, withTiming(1, { duration: 500, easing }));
    ctaTranslateY.value = withDelay(650, withTiming(0, { duration: 500, easing }));
  }, []);

  const headerStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ translateY: headerTranslateY.value }],
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
    transform: [{ translateY: subtitleTranslateY.value }],
  }));

  const badgesStyle = useAnimatedStyle(() => ({
    opacity: badgesOpacity.value,
  }));

  const ctaStyle = useAnimatedStyle(() => ({
    opacity: ctaOpacity.value,
    transform: [{ translateY: ctaTranslateY.value }],
  }));

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.topSection}>
          <View style={styles.iconContainer}>
            <Image
              source={require('@/assets/icon.png')}
              style={styles.iconImage}
              resizeMode="cover"
            />
          </View>

          <Animated.View style={[styles.headerContainer, headerStyle]}>
            <Text style={styles.title}>
              Détectez les signes avant-coureurs du burnout
            </Text>
          </Animated.View>

          <Animated.View style={[styles.subtitleContainer, subtitleStyle]}>
            <Text style={styles.subtitle}>
              Avant qu'il ne soit trop tard. Un suivi scientifique et personnalisé pour protéger votre équilibre professionnel.
            </Text>
          </Animated.View>

          <Animated.View style={[styles.badgesContainer, badgesStyle]}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>19 questions</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>5 minutes</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Résultats immédiats</Text>
            </View>
          </Animated.View>
        </View>

        <Animated.View style={[styles.ctaContainer, ctaStyle]}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push(user ? '/(onboarding)/assessment' : '/(auth)/register')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Démarrer mon évaluation gratuite</Text>
          </TouchableOpacity>

          {!user && (
            <TouchableOpacity
              style={styles.secondaryLink}
              onPress={() => router.push('/(auth)/login')}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryLinkText}>
                Déjà un compte ?{' '}
                <Text style={styles.secondaryLinkBold}>Se connecter</Text>
              </Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  container: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
    paddingBottom: 40,
  },
  topSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
  },
  iconContainer: {
    marginBottom: 32,
  },
  iconImage: {
    width: 72,
    height: 72,
    borderRadius: 20,
  },
  headerContainer: {
    marginBottom: 20,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    lineHeight: 42,
    letterSpacing: -0.5,
  },
  subtitleContainer: {
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  badgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  badge: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  ctaContainer: {
    gap: 16,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  secondaryLink: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  secondaryLinkText: {
    fontSize: 15,
    color: Colors.textSecondary,
  },
  secondaryLinkBold: {
    color: Colors.primary,
    fontWeight: '600',
  },
});
