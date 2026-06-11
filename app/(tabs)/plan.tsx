import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { useBurnoutData } from '@/hooks/useBurnoutData';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { generateActionPlan } from '@/lib/api';
import { canAccess } from '@/lib/subscription';
import { computePlanProgress, type PlanProgress } from '@/lib/planProgress';
import type { ActionPlan, Action } from '@/types/database';
import PaywallModal from '@/components/PaywallModal';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const CATEGORY_ICONS: Record<string, IoniconsName> = {
  mindfulness: 'leaf-outline',
  breathing: 'pulse-outline',
  journaling: 'journal-outline',
  movement: 'walk-outline',
  social: 'people-outline',
};

interface ActionItemProps {
  action: Action;
  completed: boolean;
  onToggle: () => void;
}

function ActionItem({ action, completed, onToggle }: ActionItemProps) {
  const icon = CATEGORY_ICONS[action.category] ?? 'sparkles-outline';
  return (
    <TouchableOpacity
      style={[styles.actionItem, completed && styles.actionItemDone]}
      onPress={onToggle}
      activeOpacity={0.75}
    >
      <View style={[styles.checkbox, completed && styles.checkboxDone]}>
        {completed && <Text style={styles.checkboxTick}>✓</Text>}
      </View>
      <View style={styles.actionContent}>
        <Text style={[styles.actionTitle, completed && styles.actionTitleDone]}>
          {action.title}
        </Text>
        <View style={styles.actionMeta}>
          <Ionicons name={icon} size={13} color={Colors.textSecondary} />
          <Text style={styles.actionDuration}>{action.duration}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

interface ProgressOverviewCardProps {
  progress: PlanProgress;
  onRestartDiagnostic: () => void;
}

function ProgressOverviewCard({ progress, onRestartDiagnostic }: ProgressOverviewCardProps) {
  const {
    totalActions,
    completedActions,
    completionRate,
    currentWeek,
    weeksRemaining,
    isComplete,
    currentStreak,
    bestStreak,
    currentWeekCompleted,
    currentWeekTotal,
  } = progress;

  return (
    <>
      <View style={styles.overviewCard}>
        <View style={styles.overviewHeader}>
          <Text style={styles.overviewTitle}>Progression du programme</Text>
          <Text style={styles.overviewPercent}>{completionRate}%</Text>
        </View>

        <View style={styles.overviewTrack}>
          <View style={[styles.overviewFill, { width: `${completionRate}%` as any }]} />
        </View>
        <Text style={styles.overviewCount}>
          {completedActions}/{totalActions} actions complétées
        </Text>

        <View style={styles.overviewMetaRow}>
          <View style={styles.overviewMetaItem}>
            <Ionicons name="calendar-outline" size={15} color={Colors.primary} />
            <Text style={styles.overviewMetaText}>Semaine {currentWeek} en cours</Text>
          </View>
          {currentStreak > 0 && (
            <View style={styles.overviewMetaItem}>
              <Ionicons name="flame-outline" size={15} color={Colors.warning} />
              <Text style={styles.overviewMetaText}>
                {currentStreak} semaine{currentStreak > 1 ? 's' : ''} consécutive{currentStreak > 1 ? 's' : ''}
              </Text>
            </View>
          )}
        </View>

        {isComplete ? (
          <View style={styles.completionBadge}>
            <Ionicons name="trophy-outline" size={20} color={Colors.primary} />
            <View style={styles.completionTextContainer}>
              <Text style={styles.completionTitle}>Programme terminé</Text>
              <Text style={styles.completionSubtitle}>Voulez-vous refaire un diagnostic ?</Text>
            </View>
            <TouchableOpacity
              style={styles.completionButton}
              onPress={onRestartDiagnostic}
              activeOpacity={0.85}
            >
              <Text style={styles.completionButtonText}>Refaire</Text>
            </TouchableOpacity>
          </View>
        ) : weeksRemaining > 0 ? (
          <Text style={styles.overviewRemaining}>
            {weeksRemaining} semaine{weeksRemaining > 1 ? 's' : ''} restante{weeksRemaining > 1 ? 's' : ''}
          </Text>
        ) : (
          <Text style={styles.overviewRemaining}>Dernière semaine du programme</Text>
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statTile}>
          <Text style={styles.statValue}>
            {currentWeekCompleted}/{currentWeekTotal}
          </Text>
          <Text style={styles.statLabel}>Cette semaine</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statTile}>
          <Text style={styles.statValue}>{completionRate}%</Text>
          <Text style={styles.statLabel}>Taux global</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statTile}>
          <Text style={styles.statValue}>
            {bestStreak} semaine{bestStreak > 1 ? 's' : ''}
          </Text>
          <Text style={styles.statLabel}>Meilleure streak</Text>
        </View>
      </View>
    </>
  );
}

export default function PlanScreen() {
  const router = useRouter();
  const { activated } = useLocalSearchParams<{ activated?: string }>();
  const { user } = useAuth();
  const { latestAssessment, recentCheckins } = useBurnoutData();

  const [plan, setPlan] = useState<ActionPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [inlineMsg, setInlineMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useFocusEffect(
    useCallback(() => {
      canAccess('action_plan').then(setIsPremium);
    }, [])
  );

  useEffect(() => {
    if (activated === '1') {
      setInlineMsg({ text: 'Programme de 8 semaines activé !', ok: true });
    }
  }, [activated]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('action_plans')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPlan(data as ActionPlan);
          const ids = new Set<string>(
            (data.completed_actions ?? []).map((a: Action) => a.id),
          );
          setCompletedIds(ids);
        }
        setLoading(false);
      });
  }, [user]);

  const handleGenerate = useCallback(async () => {
    if (!latestAssessment) {
      setInlineMsg({ text: 'Aucun diagnostic trouvé. Faites d\'abord le diagnostic CBI.', ok: false });
      return;
    }
    if (!isPremium) {
      setShowPaywall(true);
      return;
    }
    setInlineMsg(null);
    setGenerating(true);
    try {
      const newPlan = await generateActionPlan(latestAssessment.id);
      setPlan(newPlan);
      setCompletedIds(new Set());
      setInlineMsg({ text: 'Plan généré avec succès !', ok: true });
    } catch (err: any) {
      if (err?.status === 403 || err?.message?.includes('premium')) {
        setShowPaywall(true);
      } else {
        setInlineMsg({ text: err?.message ?? 'Impossible de générer le plan. Réessayez.', ok: false });
      }
    } finally {
      setGenerating(false);
    }
  }, [latestAssessment, isPremium]);

  const handleToggle = useCallback(
    async (action: Action) => {
      if (!plan || !user) return;
      const isCompleted = completedIds.has(action.id);
      const newCompleted = new Set(completedIds);

      if (isCompleted) {
        newCompleted.delete(action.id);
      } else {
        newCompleted.add(action.id);
      }
      setCompletedIds(newCompleted);

      const completedActions = (plan.actions ?? []).filter((a) => newCompleted.has(a.id));
      await supabase
        .from('action_plans')
        .update({ completed_actions: completedActions })
        .eq('id', plan.id);
    },
    [plan, user, completedIds],
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!latestAssessment && !plan) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <Ionicons name="clipboard-outline" size={48} color={Colors.textMuted} style={styles.emptyIcon} />
          <Text style={styles.emptyTitle}>Démarrez votre évaluation d'abord</Text>
          <Text style={styles.emptySubtitle}>
            Le plan d'action est généré à partir de votre évaluation CBI.
          </Text>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => router.push('/(onboarding)/welcome')}
          >
            <Text style={styles.ctaButtonText}>Démarrer l'évaluation</Text>
          </TouchableOpacity>
        </View>
        <PaywallModal visible={showPaywall} onClose={() => setShowPaywall(false)} />
      </SafeAreaView>
    );
  }

  if (!plan) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <Ionicons name="rocket-outline" size={48} color={Colors.primary} style={styles.emptyIcon} />
          <Text style={styles.emptyTitle}>Prêt pour votre plan</Text>
          <Text style={styles.emptySubtitle}>
            Générez votre programme personnalisé de 8 semaines basé sur votre diagnostic.
          </Text>
          <TouchableOpacity
            style={[styles.ctaButton, generating && styles.ctaButtonDisabled]}
            onPress={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.ctaButtonText}>Générer mon plan</Text>
            )}
          </TouchableOpacity>
          {!isPremium && (
            <Text style={styles.premiumNote}>Fonctionnalité Premium</Text>
          )}
        </View>
        <PaywallModal
          visible={showPaywall}
          onClose={() => setShowPaywall(false)}
          onSuccess={() => {
            setShowPaywall(false);
            setIsPremium(true);
            handleGenerate();
          }}
        />
      </SafeAreaView>
    );
  }

  const progress = computePlanProgress(plan, completedIds, recentCheckins);
  const currentWeek = progress.currentWeek;
  const weekActions = (plan.actions ?? [])
    .filter((a) => a.week === currentWeek)
    .slice(0, 3);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Programme 8 semaines</Text>
          <View style={styles.weekBadge}>
            <Text style={styles.weekBadgeText}>Semaine {currentWeek} / 8</Text>
          </View>
        </View>

        {/* Progression du programme */}
        <ProgressOverviewCard
          progress={progress}
          onRestartDiagnostic={() => router.push('/(onboarding)/welcome')}
        />

        {/* Actions de la semaine */}
        <View style={styles.weekCard}>
          <View style={styles.weekCardHeader}>
            <Text style={styles.weekCardTitle}>Semaine {currentWeek} en cours</Text>
            <Text style={styles.weekCardSubtitle}>3 micro-actions</Text>
          </View>

          {weekActions.length > 0 ? (
            weekActions.map((action) => (
              <ActionItem
                key={action.id}
                action={action}
                completed={completedIds.has(action.id)}
                onToggle={() => handleToggle(action)}
              />
            ))
          ) : (
            <View style={styles.emptyWeekContainer}>
              <Text style={styles.noActionsText}>
                Ce plan a été généré avec une ancienne version.
              </Text>
              <TouchableOpacity
                style={[styles.regenButton, generating && styles.ctaButtonDisabled]}
                onPress={handleGenerate}
                disabled={generating}
                activeOpacity={0.85}
              >
                {generating ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.regenButtonText}>Regénérer le plan</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Message inline (remplace Alert.alert qui ne fonctionne pas sur web) */}
        {inlineMsg && (
          <View style={[styles.inlineMsg, inlineMsg.ok ? styles.inlineMsgOk : styles.inlineMsgErr]}>
            <Text style={styles.inlineMsgText}>{inlineMsg.text}</Text>
          </View>
        )}

        {/* Bibliothèque d'exercices */}
        <TouchableOpacity
          style={[styles.libraryButton, !isPremium && styles.libraryButtonLocked]}
          onPress={() => {
            if (!isPremium) {
              setShowPaywall(true);
            } else {
              router.push('/exercises');
            }
          }}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isPremium ? 'book-outline' : 'lock-closed'}
            size={18}
            color={isPremium ? '#FFFFFF' : Colors.textSecondary}
          />
          <Text style={[styles.libraryButtonText, !isPremium && styles.libraryButtonTextLocked]}>
            Bibliothèque d'exercices{!isPremium ? ' — Premium' : ''}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSuccess={() => {
          setShowPaywall(false);
          setIsPremium(true);
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
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIcon: {
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
  ctaButton: {
    marginTop: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
    alignItems: 'center',
    minWidth: 200,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  ctaButtonDisabled: {
    opacity: 0.7,
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  premiumNote: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
  },
  weekBadge: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  weekBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  overviewCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  overviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  overviewTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  overviewPercent: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.primary,
  },
  overviewTrack: {
    height: 10,
    backgroundColor: Colors.border,
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 8,
  },
  overviewFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 5,
  },
  overviewCount: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 14,
  },
  overviewMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 12,
  },
  overviewMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  overviewMetaText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  overviewRemaining: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  completionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.primaryLight,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.primaryMuted,
  },
  completionTextContainer: {
    flex: 1,
  },
  completionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  completionSubtitle: {
    fontSize: 12,
    color: Colors.primary,
    marginTop: 2,
  },
  completionButton: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  completionButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  weekCard: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.primaryMuted,
  },
  weekCardHeader: {
    marginBottom: 16,
  },
  weekCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  weekCardSubtitle: {
    fontSize: 12,
    color: Colors.primary,
    marginTop: 2,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  actionItemDone: {
    opacity: 0.6,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  checkboxDone: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkboxTick: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    lineHeight: 20,
    marginBottom: 6,
  },
  actionTitleDone: {
    textDecorationLine: 'line-through',
    color: Colors.textMuted,
  },
  actionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionDuration: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  noActionsText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 8,
  },
  emptyWeekContainer: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  regenButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  regenButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  inlineMsg: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  inlineMsgOk: {
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primaryMuted,
  },
  inlineMsgErr: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  inlineMsgText: {
    fontSize: 14,
    color: Colors.text,
    textAlign: 'center',
    lineHeight: 20,
  },
  libraryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  libraryButtonLocked: {
    backgroundColor: Colors.surfaceAlt,
    shadowOpacity: 0,
    elevation: 0,
  },
  libraryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  libraryButtonTextLocked: {
    color: Colors.textSecondary,
  },
});
