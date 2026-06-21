import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { useBurnoutData } from '@/hooks/useBurnoutData';
import { useAuth } from '@/hooks/useAuth';
import { detectTrend, shouldAlert, saveWeeklyCheckin, wellbeingScore } from '@/lib/checkin';
import { calculateRiskScore } from '@/lib/burnout';
import type { Checkin } from '@/types/database';

function getISOWeek(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, year: d.getUTCFullYear() };
}

const RISK_COLORS: Record<string, string> = {
  low: Colors.severityNone,
  medium: Colors.severityMild,
  high: Colors.severityModerate,
  critical: Colors.severitySevere,
};

const TREND_CONFIG = {
  improving: { label: '↑ En amélioration', color: Colors.success },
  stable: { label: '→ Stable', color: Colors.textSecondary },
  declining: { label: '↓ En déclin', color: Colors.danger },
};

const CHART_HEIGHT = 100;
const SCORE_COLORS = ['#EF4444', '#F97316', '#F59E0B', '#10B981', '#1D9E75'];

function getScoreColor(score: number): string {
  if (score >= 8) return SCORE_COLORS[4];
  if (score >= 6) return SCORE_COLORS[3];
  if (score >= 4) return SCORE_COLORS[2];
  if (score >= 2) return SCORE_COLORS[1];
  return SCORE_COLORS[0];
}

interface StepperProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  invertedLabel?: string;
}

function Stepper({ label, value, onChange, invertedLabel }: StepperProps) {
  return (
    <View style={stepperStyles.row}>
      <View style={stepperStyles.labelCol}>
        <Text style={stepperStyles.label}>{label}</Text>
        {invertedLabel ? <Text style={stepperStyles.hint}>{invertedLabel}</Text> : null}
      </View>
      <View style={stepperStyles.controls}>
        <TouchableOpacity
          style={[stepperStyles.btn, value <= 1 && stepperStyles.btnDisabled]}
          onPress={() => onChange(Math.max(1, value - 1))}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <Text style={stepperStyles.btnText}>−</Text>
        </TouchableOpacity>
        <Text style={stepperStyles.value}>{value}</Text>
        <TouchableOpacity
          style={[stepperStyles.btn, value >= 10 && stepperStyles.btnDisabled]}
          onPress={() => onChange(Math.min(10, value + 1))}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <Text style={stepperStyles.btnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const stepperStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  labelCol: { flex: 1 },
  label: { fontSize: 15, fontWeight: '500', color: Colors.text },
  hint: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  btn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { backgroundColor: Colors.surfaceAlt },
  btnText: { fontSize: 18, fontWeight: '600', color: Colors.primary, lineHeight: 22 },
  value: { fontSize: 18, fontWeight: '700', color: Colors.text, minWidth: 28, textAlign: 'center' },
});

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { profile, latestAssessment, previousAssessment, recentCheckins, loading, error, refresh } = useBurnoutData();

  const [energy, setEnergy] = useState(7);
  const [motivation, setMotivation] = useState(7);
  const [stress, setStress] = useState(5);
  const [balance, setBalance] = useState(7);
  const [saving, setSaving] = useState(false);

  const { week: currentWeek, year: currentYear } = getISOWeek(new Date());
  const alreadyCheckedIn =
    recentCheckins.length > 0 &&
    recentCheckins[0].week_number === currentWeek &&
    recentCheckins[0].year === currentYear;

  const trend = detectTrend(recentCheckins);
  const alert = shouldAlert(recentCheckins);
  const trendConfig = TREND_CONFIG[trend];

  const last4: Checkin[] = recentCheckins.slice(0, 4).reverse();
  const chartScores = last4.map((c) => wellbeingScore(c));

  const handleSaveCheckin = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    try {
      await saveWeeklyCheckin({
        userId: user.id,
        energy,
        motivation,
        stress,
        work_life_balance: balance,
      });
      await refresh();
    } catch (err: any) {
      Alert.alert('Erreur', err?.message ?? 'Impossible d\'enregistrer le check-in.');
    } finally {
      setSaving(false);
    }
  }, [user, energy, motivation, stress, balance, refresh]);

  const isPremium = profile?.subscription_tier === 'premium';

  const weeksWithoutCheckin = (() => {
    if (recentCheckins.length === 0) return 0;
    const latest = recentCheckins[0];
    const { week: cw, year: cy } = getISOWeek(new Date());
    return Math.max(0, (cy - latest.year) * 52 + (cw - latest.week_number));
  })();

  const riskScore = latestAssessment && recentCheckins.length >= 3
    ? calculateRiskScore({
        checkins: recentCheckins.slice(0, 8),
        latestAssessment,
        previousAssessment,
        weeksWithoutCheckin,
      })
    : null;

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!latestAssessment) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.welcomeContainer}>
          <Ionicons name="leaf-outline" size={64} color={Colors.primary} style={styles.welcomeIcon} />
          <Text style={styles.welcomeTitle}>Bienvenue sur FirstSign</Text>
          <Text style={styles.welcomeSubtitle}>
            Commencez par évaluer votre niveau de burnout. Cela prend environ 5 minutes.
          </Text>
          <TouchableOpacity
            style={styles.welcomeButton}
            onPress={() => router.push('/(onboarding)/assessment')}
            activeOpacity={0.85}
          >
            <Text style={styles.welcomeButtonText}>Détectez vos signaux d'alerte</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {alert && (
        <TouchableOpacity style={styles.alertBanner} onPress={() => router.push('/(tabs)/plan')}>
          <View style={styles.alertContent}>
            <Ionicons name="warning-outline" size={18} color="#FFFFFF" />
            <Text style={styles.alertText}>
              Votre bien-être se dégrade. Consultez votre plan d'action.
            </Text>
          </View>
          <Text style={styles.alertLink}>Voir →</Text>
        </TouchableOpacity>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.pageHeader}>
          <Text style={styles.greeting}>Tableau de bord</Text>
          <Text style={styles.date}>{today}</Text>
        </View>

        {error ? (
          <TouchableOpacity style={styles.errorBox} onPress={refresh}>
            <Text style={styles.errorText}>Erreur de chargement — Appuyer pour réessayer</Text>
          </TouchableOpacity>
        ) : null}

        {/* Score burnout */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Votre risque de burnout actuel</Text>
          {latestAssessment ? (
            <>
              <View style={styles.scoreRow}>
                <Text style={[styles.scoreValue, { color: RISK_COLORS[latestAssessment.risk_level] }]}>
                  {latestAssessment.total_score}
                  <Text style={styles.scoreMax}>/100</Text>
                </Text>
                <View style={[styles.trendBadge, { backgroundColor: trendConfig.color + '18' }]}>
                  <Text style={[styles.trendText, { color: trendConfig.color }]}>
                    {trendConfig.label}
                  </Text>
                </View>
              </View>
              <View style={styles.scoreBarTrack}>
                <View
                  style={[
                    styles.scoreBarFill,
                    {
                      width: `${latestAssessment.total_score}%` as any,
                      backgroundColor: RISK_COLORS[latestAssessment.risk_level],
                    },
                  ]}
                />
              </View>
              <TouchableOpacity
                style={styles.detailLink}
                onPress={() =>
                  router.push({
                    pathname: '/(onboarding)/results',
                    params: { assessmentId: latestAssessment.id },
                  })
                }
                activeOpacity={0.7}
              >
                <Text style={styles.detailLinkText}>Voir le détail du diagnostic →</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.retakeButton}
                onPress={() => router.push('/(onboarding)/assessment')}
                activeOpacity={0.7}
              >
                <Text style={styles.retakeButtonText}>Refaire l'évaluation</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.noDataContainer}>
              <Text style={styles.noDataText}>Aucun diagnostic effectué</Text>
              <TouchableOpacity
                style={styles.ctaSmall}
                onPress={() => router.push('/(onboarding)/welcome')}
              >
                <Text style={styles.ctaSmallText}>Démarrer l'évaluation →</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Risque prédictif */}
        {latestAssessment && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Risque d'aggravation dans 4 semaines</Text>
            {riskScore === null ? (
              <View style={styles.riskInsufficientData}>
                <Ionicons name="analytics-outline" size={32} color={Colors.textMuted} />
                <Text style={styles.riskInsufficientText}>
                  Complétez 3 check-ins pour activer la prévision
                </Text>
                <Text style={styles.riskInsufficientSub}>
                  {recentCheckins.length}/3 check-ins effectués
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.riskScoreRow}>
                  <Text style={[styles.riskScoreValue, { color: riskScore.color }]}>
                    {riskScore.score}%
                  </Text>
                  <View style={[styles.riskLevelBadge, { backgroundColor: riskScore.color + '22' }]}>
                    <Text style={[styles.riskLevelText, { color: riskScore.color }]}>
                      {riskScore.level}
                    </Text>
                  </View>
                </View>
                <View style={styles.riskBarTrack}>
                  <View
                    style={[
                      styles.riskBarFill,
                      { width: `${riskScore.score}%` as any, backgroundColor: riskScore.color },
                    ]}
                  />
                </View>
                {isPremium ? (
                  <View style={styles.riskFactors}>
                    {riskScore.mainFactors.map((factor, i) => (
                      <View key={i} style={styles.riskFactorRow}>
                        <View style={[styles.riskFactorDot, { backgroundColor: riskScore.color }]} />
                        <Text style={styles.riskFactorText}>{factor}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.riskPremiumTeaser}
                    onPress={() => router.push('/(tabs)/profile')}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="lock-closed-outline" size={13} color={Colors.textMuted} />
                    <Text style={styles.riskPremiumTeaserText}>
                      Facteurs détaillés disponibles en Premium
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        )}

        {/* Graphique 4 semaines */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Évolution sur 4 semaines</Text>
          {chartScores.length >= 2 ? (
            <View style={styles.chartContainer}>
              <View style={styles.chartBars}>
                {chartScores.map((score, idx) => {
                  const barHeight = Math.max(8, (score / 10) * CHART_HEIGHT);
                  const color = getScoreColor(score);
                  return (
                    <View key={idx} style={styles.chartColumn}>
                      <Text style={[styles.chartValue, { color }]}>{score.toFixed(1)}</Text>
                      <View style={styles.chartBarWrapper}>
                        <View
                          style={[
                            styles.chartBar,
                            { height: barHeight, backgroundColor: color },
                          ]}
                        />
                      </View>
                      <Text style={styles.chartLabel}>S{last4[idx]?.week_number ?? idx + 1}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : (
            <Text style={styles.noDataText}>Pas encore assez de données</Text>
          )}
        </View>

        {/* Check-in hebdomadaire */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Check-in cette semaine</Text>
          {alreadyCheckedIn ? (
            <View style={styles.checkinDone}>
              <Text style={styles.checkinDoneIcon}>✓</Text>
              <Text style={styles.checkinDoneText}>Check-in enregistré cette semaine</Text>
              <Text style={styles.checkinDoneScore}>
                Bien-être : {wellbeingScore(recentCheckins[0]).toFixed(1)}/10
              </Text>
            </View>
          ) : (
            <>
              <Stepper label="Énergie" value={energy} onChange={setEnergy} />
              <Stepper label="Motivation" value={motivation} onChange={setMotivation} />
              <Stepper
                label="Stress"
                value={stress}
                onChange={setStress}
                invertedLabel="faible = mieux"
              />
              <Stepper label="Équilibre pro/perso" value={balance} onChange={setBalance} />
              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={handleSaveCheckin}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.saveButtonText}>Enregistrer</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
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
  },
  welcomeContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  welcomeIcon: {
    marginBottom: 24,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  welcomeSubtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  welcomeButton: {
    backgroundColor: '#1D9E75',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    width: '100%',
  },
  welcomeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  alertBanner: {
    backgroundColor: Colors.danger,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  alertContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  alertText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  alertLink: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
    marginLeft: 8,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  pageHeader: {
    paddingVertical: 20,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.text,
  },
  date: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    color: Colors.danger,
    fontSize: 13,
    textAlign: 'center',
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 16,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 8,
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: '800',
    lineHeight: 56,
  },
  scoreMax: {
    fontSize: 22,
    fontWeight: '400',
    color: Colors.textMuted,
  },
  trendBadge: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  trendText: {
    fontSize: 13,
    fontWeight: '700',
  },
  scoreBarTrack: {
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  detailLink: {
    marginTop: 16,
    alignItems: 'center',
  },
  detailLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  retakeButton: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  retakeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  noDataContainer: {
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  noDataText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  ctaSmall: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  ctaSmallText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  chartContainer: {
    paddingTop: 4,
  },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: CHART_HEIGHT + 48,
  },
  chartColumn: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  chartValue: {
    fontSize: 11,
    fontWeight: '600',
  },
  chartBarWrapper: {
    height: CHART_HEIGHT,
    justifyContent: 'flex-end',
    width: '60%',
  },
  chartBar: {
    borderRadius: 4,
    minHeight: 8,
  },
  chartLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  checkinDone: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  checkinDoneIcon: {
    fontSize: 32,
    color: Colors.success,
  },
  checkinDoneText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  checkinDoneScore: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  saveButton: {
    marginTop: 16,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  riskInsufficientData: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  riskInsufficientText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
  },
  riskInsufficientSub: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  riskScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  riskScoreValue: {
    fontSize: 40,
    fontWeight: '800',
    lineHeight: 48,
  },
  riskLevelBadge: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  riskLevelText: {
    fontSize: 14,
    fontWeight: '700',
  },
  riskBarTrack: {
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 14,
  },
  riskBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  riskFactors: {
    gap: 8,
  },
  riskFactorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  riskFactorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  riskFactorText: {
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
  },
  riskPremiumTeaser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  riskPremiumTeaserText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
});
