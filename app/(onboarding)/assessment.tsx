import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Colors } from '@/constants/colors';
import { MBI_QUESTIONS, MBI_SCALE } from '@/lib/burnout';
import { calculateBurnoutScore } from '@/lib/api';
import { supabase } from '@/lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TOTAL = MBI_QUESTIONS.length;

export default function AssessmentScreen() {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>(new Array(TOTAL).fill(-1));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);
  const progressWidth = useSharedValue(((1) / TOTAL) * 100);

  const animatedCard = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  const animatedProgress = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%` as any,
  }));

  const navigateToQuestion = useCallback(
    (targetIndex: number, direction: 'forward' | 'back') => {
      const outOffset = direction === 'forward' ? -SCREEN_WIDTH * 0.3 : SCREEN_WIDTH * 0.3;
      const inOffset = direction === 'forward' ? SCREEN_WIDTH * 0.3 : -SCREEN_WIDTH * 0.3;

      opacity.value = withTiming(0, { duration: 150, easing: Easing.out(Easing.quad) });
      translateX.value = withTiming(
        outOffset,
        { duration: 180, easing: Easing.out(Easing.quad) },
        () => {
          translateX.value = inOffset;
          opacity.value = withTiming(1, { duration: 200 });
          translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
          runOnJS(setCurrentIndex)(targetIndex);
        },
      );
      progressWidth.value = withTiming(((targetIndex + 1) / TOTAL) * 100, { duration: 300 });
    },
    [],
  );

  function handleAnswer(value: number) {
    const updated = [...answers];
    updated[currentIndex] = value;
    setAnswers(updated);

    if (currentIndex < TOTAL - 1) {
      navigateToQuestion(currentIndex + 1, 'forward');
    }
  }

  function handlePrevious() {
    if (currentIndex === 0) {
      if (router.canGoBack()) {
        router.back();
      }
      return;
    }
    navigateToQuestion(currentIndex - 1, 'back');
  }

  async function handleSubmit() {
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Vous devez être connecté pour voir vos résultats.');
      return;
    }
    setLoading(true);
    try {
      const finalAnswers = answers.map((a) => (a === -1 ? 0 : a));
      const result = await calculateBurnoutScore(finalAnswers);
      router.push({
        pathname: '/(onboarding)/results',
        params: { assessmentId: result.assessment_id },
      });
    } catch (err: any) {
      setError(err?.message ?? 'Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  }

  const question = MBI_QUESTIONS[currentIndex];
  const selectedAnswer = answers[currentIndex];
  const isLastQuestion = currentIndex === TOTAL - 1;

  const dimensionLabel =
    question.dimension === 'exhaustion'
      ? 'Épuisement émotionnel'
      : question.dimension === 'cynicism'
      ? 'Cynisme'
      : 'Efficacité personnelle';

  const dimensionStyle =
    question.dimension === 'exhaustion'
      ? styles.dimensionExhaustion
      : question.dimension === 'cynicism'
      ? styles.dimensionCynicism
      : styles.dimensionEfficacy;

  const backDisabled = currentIndex === 0 && !router.canGoBack();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handlePrevious}
          disabled={backDisabled}
          style={[styles.backButton, backDisabled && styles.backButtonDisabled]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.backArrow, backDisabled && styles.backArrowDisabled]}>←</Text>
        </TouchableOpacity>

        <Text style={styles.progressLabel}>
          {currentIndex + 1}
          <Text style={styles.progressLabelTotal}>/{TOTAL}</Text>
        </Text>

        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.progressBarTrack}>
        <Animated.View style={[styles.progressBarFill, animatedProgress]} />
      </View>

      <View style={styles.dimensionRow}>
        <View style={[styles.dimensionBadge, dimensionStyle]}>
          <Text style={styles.dimensionText}>{dimensionLabel}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.questionCard, animatedCard]}>
          <Text style={styles.questionText}>{question.text}</Text>
        </Animated.View>

        <View style={styles.answersContainer}>
          {MBI_SCALE.map((label, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.answerButton, selectedAnswer === index && styles.answerButtonSelected]}
              onPress={() => handleAnswer(index)}
              activeOpacity={0.75}
            >
              <View style={[styles.answerIndex, selectedAnswer === index && styles.answerIndexSelected]}>
                <Text style={[styles.answerIndexText, selectedAnswer === index && styles.answerIndexTextSelected]}>
                  {index}
                </Text>
              </View>
              <Text style={[styles.answerLabel, selectedAnswer === index && styles.answerLabelSelected]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {isLastQuestion ? (
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>Voir mes résultats</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: Colors.surfaceAlt,
  },
  backButtonDisabled: {
    opacity: 0.3,
  },
  backArrow: {
    fontSize: 20,
    color: Colors.text,
    fontWeight: '600',
  },
  backArrowDisabled: {
    color: Colors.textMuted,
  },
  progressLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  progressLabelTotal: {
    fontSize: 16,
    fontWeight: '400',
    color: Colors.textMuted,
  },
  headerSpacer: {
    width: 40,
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: Colors.border,
    marginHorizontal: 20,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  dimensionRow: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  dimensionBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: Colors.surfaceAlt,
  },
  dimensionExhaustion: {
    backgroundColor: '#FEF3C7',
  },
  dimensionCynicism: {
    backgroundColor: '#FEE2E2',
  },
  dimensionEfficacy: {
    backgroundColor: Colors.primaryLight,
  },
  dimensionText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  questionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    minHeight: 120,
    justifyContent: 'center',
  },
  questionText: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.text,
    lineHeight: 30,
    textAlign: 'center',
  },
  answersContainer: {
    gap: 10,
  },
  answerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 14,
  },
  answerButtonSelected: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  answerIndex: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerIndexSelected: {
    backgroundColor: Colors.primary,
  },
  answerIndexText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  answerIndexTextSelected: {
    color: '#FFFFFF',
  },
  answerLabel: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
    lineHeight: 20,
  },
  answerLabelSelected: {
    color: Colors.primary,
    fontWeight: '600',
  },
  errorBox: {
    marginTop: 20,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    color: Colors.danger,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  submitButton: {
    marginTop: 28,
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
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
