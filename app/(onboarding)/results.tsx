import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { generateActionPlan } from '@/lib/api';
import { scheduleWeeklyCheckinReminder } from '@/lib/notifications';
import type { Assessment, RiskLevel } from '@/types/database';
import PaywallModal from '@/components/PaywallModal';

const RISK_LABELS: Record<RiskLevel, string> = {
  low: 'Risque faible',
  medium: 'Risque modéré',
  high: 'Risque élevé',
  critical: 'Risque critique',
};

const RISK_COLORS: Record<RiskLevel, string> = {
  low: Colors.severityNone,
  medium: Colors.severityMild,
  high: Colors.severityModerate,
  critical: Colors.severitySevere,
};

const RISK_DESCRIPTIONS: Record<RiskLevel, string> = {
  low: 'Vos niveaux de stress sont gérables. Maintenez vos bonnes pratiques de bien-être.',
  medium: 'Des signes préoccupants de stress chronique sont présents. Agissez maintenant.',
  high: 'Risque élevé de burnout détecté. Des changements significatifs sont nécessaires.',
  critical: 'Épuisement professionnel sévère. Consultez un professionnel de santé.',
};

interface GaugeBarProps {
  label: string;
  value: number;
  max: number;
  inverted?: boolean;
  color: string;
  delay?: number;
}

function GaugeBar({ label, value, max, inverted = false, color, delay = 0 }: GaugeBarProps) {
  const fillWidth = useSharedValue(0);
  const burnoutRatio = inverted ? 1 - value / max : value / max;
  const percentage = Math.round(burnoutRatio * 100);

  useEffect(() => {
    fillWidth.value = withDelay(
      delay,
      withTiming(burnoutRatio * 100, { duration: 800, easing: Easing.out(Easing.cubic) }),
    );
  }, []);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fillWidth.value}%` as any,
  }));

  return (
    <View style={gaugeStyles.container}>
      <View style={gaugeStyles.labelRow}>
        <Text style={gaugeStyles.label}>{label}</Text>
        <Text style={[gaugeStyles.percentage, { color }]}>{percentage}%</Text>
      </View>
      <View style={gaugeStyles.track}>
        <Animated.View style={[gaugeStyles.fill, { backgroundColor: color }, fillStyle]} />
      </View>
    </View>
  );
}

const gaugeStyles = StyleSheet.create({
  container: { marginBottom: 20 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.text },
  percentage: { fontSize: 14, fontWeight: '700' },
  track: { height: 10, backgroundColor: Colors.border, borderRadius: 5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
});

export default function ResultsScreen() {
  const router = useRouter();
  const { assessmentId } = useLocalSearchParams<{ assessmentId: string }>();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loadingAssessment, setLoadingAssessment] = useState(true);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  const scoreBarWidth = useSharedValue(0);
  const contentOpacity = useSharedValue(0);

  useEffect(() => {
    if (!assessmentId) {
      setError('Identifiant de diagnostic manquant.');
      setLoadingAssessment(false);
      return;
    }

    supabase
      .from('assessments')
      .select('*')
      .eq('id', assessmentId)
      .single()
      .then(({ data, error: fetchError }) => {
        if (!fetchError && data) {
          setAssessment(data as Assessment);
          scheduleWeeklyCheckinReminder();
        } else {
          setError('Impossible de charger les résultats.');
        }
        setLoadingAssessment(false);
      });
  }, [assessmentId]);

  useEffect(() => {
    if (!assessment) return;
    contentOpacity.value = withTiming(1, { duration: 500 });
    scoreBarWidth.value = withDelay(
      300,
      withTiming(assessment.total_score, { duration: 1000, easing: Easing.out(Easing.cubic) }),
    );
  }, [assessment]);

  const contentStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));
  const scoreBarStyle = useAnimatedStyle(() => ({ width: `${scoreBarWidth.value}%` as any }));

  async function handleGeneratePlan() {
    if (!assessmentId) return;
    setError(null);
    setLoadingPlan(true);
    try {
      await generateActionPlan(assessmentId);
      router.replace('/(tabs)/plan');
    } catch (err: any) {
      if (err?.status === 403 || err?.message?.includes('premium')) {
        setShowPaywall(true);
      } else {
        setError(err?.message ?? 'Impossible de générer le plan. Réessayez.');
      }
    } finally {
      setLoadingPlan(false);
    }
  }

  if (loadingAssessment) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Analyse de vos résultats...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!assessment) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorTextLarge}>{error ?? 'Impossible de charger les résultats.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const riskColor = RISK_COLORS[assessment.risk_level];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.content, contentStyle]}>
          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>Votre diagnostic</Text>
            <Text style={styles.pageSubtitle}>Questionnaire MBI — 22 questions</Text>
          </View>

          <View style={[styles.scoreCard, { borderColor: riskColor }]}>
            <View style={styles.scoreLabelRow}>
              <Text style={styles.scoreLabelMain}>Score global de burnout</Text>
              <View style={[styles.riskBadge, { backgroundColor: riskColor + '22' }]}>
                <Text style={[styles.riskBadgeText, { color: riskColor }]}>
                  {RISK_LABELS[assessment.risk_level]}
                </Text>
              </View>
            </View>

            <Text style={[styles.scoreNumber, { color: riskColor }]}>
              {assessment.total_score}
              <Text style={styles.scoreMax}>/100</Text>
            </Text>

            <View style={styles.scoreBarTrack}>
              <Animated.View style={[styles.scoreBarFill, { backgroundColor: riskColor }, scoreBarStyle]} />
            </View>

            <Text style={styles.riskDescription}>{RISK_DESCRIPTIONS[assessment.risk_level]}</Text>
          </View>

          <View style={styles.dimensionsCard}>
            <Text style={styles.sectionTitle}>Détail par dimension</Text>
            <GaugeBar
              label="Épuisement émotionnel"
              value={assessment.exhaustion_score}
              max={54}
              color={Colors.severityModerate}
              delay={200}
            />
            <GaugeBar
              label="Cynisme / Dépersonnalisation"
              value={assessment.cynicism_score}
              max={30}
              color={Colors.severityMild}
              delay={400}
            />
            <GaugeBar
              label="Efficacité personnelle"
              value={assessment.efficacy_score}
              max={48}
              inverted
              color={Colors.severitySevere}
              delay={600}
            />
            <Text style={styles.legendText}>
              * Pour l'efficacité, un score bas indique un risque plus élevé.
            </Text>
          </View>

          <View style={styles.detailsRow}>
            {[
              { value: assessment.exhaustion_score, label: 'Épuisement\n/54' },
              { value: assessment.cynicism_score, label: 'Cynisme\n/30' },
              { value: assessment.efficacy_score, label: 'Efficacité\n/48' },
            ].map((item, idx) => (
              <View key={idx} style={styles.detailChip}>
                <Text style={styles.detailChipValue}>{item.value}</Text>
                <Text style={styles.detailChipLabel}>{item.label}</Text>
              </View>
            ))}
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.ctaButton, loadingPlan && styles.ctaButtonDisabled]}
            onPress={handleGeneratePlan}
            disabled={loadingPlan}
            activeOpacity={0.85}
          >
            {loadingPlan ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.ctaButtonText}>Voir mon plan d'action</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>

      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSuccess={() => {
          setShowPaywall(false);
          handleGeneratePlan();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 24,
  },
  loadingText: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  errorTextLarge: {
    fontSize: 16,
    color: Colors.danger,
    textAlign: 'center',
  },
  scrollContent: {
    paddingBottom: 48,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  pageHeader: {
    marginBottom: 24,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  scoreCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  scoreLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 8,
  },
  scoreLabelMain: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  riskBadge: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  riskBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  scoreNumber: {
    fontSize: 56,
    fontWeight: '800',
    lineHeight: 64,
    marginBottom: 16,
  },
  scoreMax: {
    fontSize: 24,
    fontWeight: '400',
    color: Colors.textMuted,
  },
  scoreBarTrack: {
    height: 12,
    backgroundColor: Colors.border,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 16,
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 6,
  },
  riskDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 21,
  },
  dimensionsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 20,
  },
  legendText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  detailsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  detailChip: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  detailChipValue: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 4,
  },
  detailChipLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    color: Colors.danger,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  ctaButton: {
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
  ctaButtonDisabled: {
    opacity: 0.7,
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
