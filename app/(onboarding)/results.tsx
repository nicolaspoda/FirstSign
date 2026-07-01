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
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { Colors } from '@/constants/colors';
import { getScoreLevel } from '@/lib/burnout';
import { supabase } from '@/lib/supabase';
import { generateActionPlan } from '@/lib/api';
import { scheduleWeeklyCheckinReminder } from '@/lib/notifications';
import { clearBurnoutCache } from '@/hooks/useBurnoutData';
import { canAccess } from '@/lib/subscription';
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

const DIMENSION_DESCRIPTIONS: Record<'personal' | 'work' | 'relations', Record<RiskLevel, string>> = {
  personal: {
    low: 'Votre niveau d\'épuisement personnel est faible.',
    medium: 'Vous ressentez une fatigue modérée.',
    high: 'Vous êtes significativement épuisé(e).',
    critical: 'Votre épuisement personnel est sévère.',
  },
  work: {
    low: 'Votre travail ne vous épuise pas particulièrement.',
    medium: 'Votre travail génère une fatigue modérée.',
    high: 'Votre travail vous épuise significativement.',
    critical: 'Votre épuisement professionnel est sévère.',
  },
  relations: {
    low: 'Vos relations professionnelles ne vous épuisent pas.',
    medium: 'Vos relations professionnelles génèrent une légère fatigue.',
    high: 'Vos relations professionnelles vous épuisent.',
    critical: 'Vos relations professionnelles vous épuisent sévèrement.',
  },
};

interface GaugeBarProps {
  label: string;
  value: number; // 0–100
  color: string;
  description?: string;
  delay?: number;
}

function GaugeBar({ label, value, color, description, delay = 0 }: GaugeBarProps) {
  const fillWidth = useSharedValue(0);

  useEffect(() => {
    fillWidth.value = withDelay(
      delay,
      withTiming(value, { duration: 800, easing: Easing.out(Easing.cubic) }),
    );
  }, []);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fillWidth.value}%` as any,
  }));

  return (
    <View style={gaugeStyles.container}>
      <View style={gaugeStyles.labelRow}>
        <Text style={gaugeStyles.label}>{label}</Text>
        <Text style={[gaugeStyles.percentage, { color }]}>{value}%</Text>
      </View>
      <View style={gaugeStyles.track}>
        <Animated.View style={[gaugeStyles.fill, { backgroundColor: color }, fillStyle]} />
      </View>
      {description ? <Text style={gaugeStyles.description}>{description}</Text> : null}
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
  description: { fontSize: 12, color: Colors.textSecondary, marginTop: 8, lineHeight: 17 },
});

const STABLE_THRESHOLD = 3;

type EvolutionDirection = 'up' | 'down' | 'stable';

function getEvolutionDirection(current: number, previous: number, higherIsBetter: boolean): EvolutionDirection {
  const diff = current - previous;
  if (Math.abs(diff) < STABLE_THRESHOLD) return 'stable';
  const improved = higherIsBetter ? diff > 0 : diff < 0;
  return improved ? 'up' : 'down';
}

const EVOLUTION_MESSAGES: Record<EvolutionDirection, string> = {
  up: 'Vous progressez, continuez comme ça !',
  down: "C'est une période difficile, le plan d'action peut vous aider.",
  stable: 'Votre situation est stable.',
};

interface ComparisonRowProps {
  label: string;
  current: number;
  previous: number;
  higherIsBetter?: boolean;
  bold?: boolean;
}

function ComparisonRow({ label, current, previous, higherIsBetter = false, bold = false }: ComparisonRowProps) {
  const direction = getEvolutionDirection(current, previous, higherIsBetter);
  const diff = Math.abs(current - previous);
  const color = direction === 'up' ? Colors.success : direction === 'down' ? Colors.danger : Colors.textMuted;

  return (
    <View style={comparisonStyles.row}>
      <Text style={[comparisonStyles.label, bold && comparisonStyles.labelBold]}>{label}</Text>
      {direction === 'stable' ? (
        <Text style={comparisonStyles.stable}>—</Text>
      ) : (
        <View style={comparisonStyles.change}>
          <Ionicons name={direction === 'up' ? 'arrow-up' : 'arrow-down'} size={16} color={color} />
          <Text style={[comparisonStyles.changeText, { color }]}>{diff} pts</Text>
        </View>
      )}
    </View>
  );
}

const comparisonStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  label: { fontSize: 14, color: Colors.text, fontWeight: '500' },
  labelBold: { fontWeight: '700' },
  stable: { fontSize: 16, color: Colors.textMuted, fontWeight: '700' },
  change: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  changeText: { fontSize: 14, fontWeight: '700' },
});

function BackHeader() {
  const router = useRouter();
  if (!router.canGoBack()) return null;

  return (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => router.back()}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={styles.backButton}
      >
        <Ionicons name="chevron-back" size={24} color={Colors.text} />
      </TouchableOpacity>
    </View>
  );
}

export default function ResultsScreen() {
  const router = useRouter();
  const { assessmentId } = useLocalSearchParams<{ assessmentId: string }>();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [previousAssessment, setPreviousAssessment] = useState<Assessment | null>(null);
  const [needsContext, setNeedsContext] = useState(false);
  const [loadingAssessment, setLoadingAssessment] = useState(true);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [isPremium, setIsPremium] = useState(false);

  const scoreBarWidth = useSharedValue(0);
  const contentOpacity = useSharedValue(0);

  useEffect(() => {
    if (!assessmentId) {
      setError('Identifiant de diagnostic manquant.');
      setLoadingAssessment(false);
      return;
    }

    let cancelled = false;

    async function load() {
      const { data, error: fetchError } = await supabase
        .from('assessments')
        .select('*')
        .eq('id', assessmentId)
        .single();

      if (cancelled) return;

      if (fetchError || !data) {
        setError('Impossible de charger les résultats.');
        setLoadingAssessment(false);
        return;
      }

      setAssessment(data as Assessment);
      scheduleWeeklyCheckinReminder();
      clearBurnoutCache(data.user_id);

      const { data: previousData } = await supabase
        .from('assessments')
        .select('*')
        .eq('user_id', data.user_id)
        .lt('created_at', data.created_at)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      const previous = (previousData as Assessment | null) ?? null;
      setPreviousAssessment(previous);

      if (!previous) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('sector, remote_work, main_stress_source')
          .eq('user_id', data.user_id)
          .maybeSingle();

        if (cancelled) return;

        setNeedsContext(
          !profile || (profile.sector === null && profile.remote_work === null && profile.main_stress_source === null)
        );
      }

      setLoadingAssessment(false);
    }

    load();
    return () => {
      cancelled = true;
    };
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

  async function handleCreatePlan() {
    if (!assessmentId) return;

    if (needsContext) {
      router.push({ pathname: '/(onboarding)/context', params: { assessmentId } });
      return;
    }

    const hasAccess = isPremium || (await canAccess('action_plan').then((v) => { setIsPremium(v); return v; }));
    if (!hasAccess) {
      setShowPaywall(true);
      return;
    }

    setError(null);
    setLoadingPlan(true);
    try {
      const { data: existingPlan } = await supabase
        .from('action_plans')
        .select('id')
        .eq('assessment_id', assessmentId)
        .maybeSingle();

      if (!existingPlan) {
        await generateActionPlan(assessmentId);
      }

      router.replace({ pathname: '/(onboarding)/plan-preview', params: { assessmentId } });
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

  function handleBackToDashboard() {
    router.replace('/(tabs)');
  }

  if (loadingAssessment) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <BackHeader />
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
        <BackHeader />
        <View style={styles.centerContainer}>
          <Text style={styles.errorTextLarge}>{error ?? 'Impossible de charger les résultats.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const riskColor = RISK_COLORS[assessment.risk_level];

  return (
    <SafeAreaView style={styles.safeArea}>
      <BackHeader />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.content, contentStyle]}>
          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>Votre diagnostic</Text>
            <Text style={styles.pageSubtitle}>Questionnaire CBI — 19 questions</Text>
          </View>

          <View style={[styles.scoreCard, { borderColor: riskColor }]}>
            <View style={styles.scoreLabelRow}>
              <Text style={styles.scoreLabelMain}>Niveau de risque de burnout</Text>
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
            <Text style={styles.actionPrompt}>
              Ces résultats vous aident à agir avant que la situation ne s'aggrave.
            </Text>
          </View>

          <View style={styles.dimensionsCard}>
            <Text style={styles.sectionTitle}>Détail par dimension</Text>
            <GaugeBar
              label="Épuisement personnel"
              value={assessment.exhaustion_score}
              color={Colors.severityModerate}
              description={DIMENSION_DESCRIPTIONS.personal[getScoreLevel(assessment.exhaustion_score)]}
              delay={200}
            />
            <GaugeBar
              label="Épuisement professionnel"
              value={assessment.cynicism_score}
              color={Colors.severityMild}
              description={DIMENSION_DESCRIPTIONS.work[getScoreLevel(assessment.cynicism_score)]}
              delay={400}
            />
            <GaugeBar
              label="Épuisement relationnel"
              value={assessment.efficacy_score}
              color={Colors.severitySevere}
              description={DIMENSION_DESCRIPTIONS.relations[getScoreLevel(assessment.efficacy_score)]}
              delay={600}
            />
          </View>

          <View style={styles.detailsRow}>
            {[
              { value: assessment.exhaustion_score, label: 'Personnel\n/100' },
              { value: assessment.cynicism_score, label: 'Professionnel\n/100' },
              { value: assessment.efficacy_score, label: 'Relationnel\n/100' },
            ].map((item, idx) => (
              <View key={idx} style={styles.detailChip}>
                <Text style={styles.detailChipValue}>{item.value}</Text>
                <Text style={styles.detailChipLabel}>{item.label}</Text>
              </View>
            ))}
          </View>

          {previousAssessment ? (
            <View style={styles.evolutionCard}>
              <Text style={styles.sectionTitle}>Votre évolution depuis le dernier diagnostic</Text>

              <ComparisonRow
                label="Épuisement personnel"
                current={assessment.exhaustion_score}
                previous={previousAssessment.exhaustion_score}
              />
              <ComparisonRow
                label="Épuisement professionnel"
                current={assessment.cynicism_score}
                previous={previousAssessment.cynicism_score}
              />
              <ComparisonRow
                label="Épuisement relationnel"
                current={assessment.efficacy_score}
                previous={previousAssessment.efficacy_score}
              />

              <View style={styles.evolutionDivider} />

              <ComparisonRow
                label="Score global"
                current={assessment.total_score}
                previous={previousAssessment.total_score}
                bold
              />

              <Text style={styles.evolutionMessage}>
                {EVOLUTION_MESSAGES[getEvolutionDirection(assessment.total_score, previousAssessment.total_score, false)]}
              </Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Text style={styles.cbiNote}>
            Basé sur le Copenhagen Burnout Inventory (CBI) — outil scientifique libre de droits
          </Text>

          {previousAssessment ? (
            <TouchableOpacity
              style={[styles.ctaButton, loadingPlan && styles.ctaButtonDisabled]}
              onPress={handleCreatePlan}
              disabled={loadingPlan}
              activeOpacity={0.85}
            >
              {loadingPlan ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.ctaButtonText}>Mettre à jour mon plan →</Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={handleBackToDashboard}
              activeOpacity={0.85}
            >
              <Text style={styles.ctaButtonText}>Accéder à mon tableau de bord →</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </ScrollView>

      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSuccess={() => {
          setShowPaywall(false);
          setIsPremium(true);
          handleCreatePlan();
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
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
  actionPrompt: {
    fontSize: 13,
    color: Colors.primary,
    lineHeight: 19,
    marginTop: 10,
    fontWeight: '500',
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
  cbiNote: {
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: 'italic',
    lineHeight: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  evolutionCard: {
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
  evolutionDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  evolutionMessage: {
    marginTop: 16,
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 21,
    textAlign: 'center',
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
