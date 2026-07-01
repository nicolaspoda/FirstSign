import { useEffect, useRef, useState } from 'react';
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
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import type { ActionPlan, Action } from '@/types/database';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const CATEGORY_ICONS: Record<string, IoniconsName> = {
  mindfulness: 'leaf-outline',
  breathing: 'pulse-outline',
  journaling: 'journal-outline',
  movement: 'walk-outline',
  social: 'people-outline',
};

interface PreviewActionItemProps {
  action: Action;
  isLast?: boolean;
}

function PreviewActionItem({ action, isLast = false }: PreviewActionItemProps) {
  const icon = CATEGORY_ICONS[action.category] ?? 'sparkles-outline';
  return (
    <View style={[styles.actionItem, isLast && styles.actionItemLast]}>
      <View style={styles.actionIconCircle}>
        <Ionicons name={icon} size={18} color={Colors.primary} />
      </View>
      <View style={styles.actionContent}>
        <Text style={styles.actionTitle}>{action.title}</Text>
        <Text style={styles.actionDuration}>{action.duration}</Text>
      </View>
    </View>
  );
}

export default function PlanPreviewScreen() {
  const router = useRouter();
  const { assessmentId } = useLocalSearchParams<{ assessmentId: string }>();
  const [plan, setPlan] = useState<ActionPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!assessmentId) {
      setLoading(false);
      return;
    }

    let attempts = 0;
    const MAX_ATTEMPTS = 20;

    function fetchPlan() {
      supabase
        .from('action_plans')
        .select('*')
        .eq('assessment_id', assessmentId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setPlan(data as ActionPlan);
            setLoading(false);
          } else if (attempts < MAX_ATTEMPTS) {
            attempts++;
            timeoutRef.current = setTimeout(fetchPlan, 2000);
          } else {
            setLoading(false);
          }
        });
    }

    fetchPlan();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [assessmentId]);

  function handleContinue() {
    router.replace({ pathname: '/(tabs)/plan', params: { activated: '1' } });
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Génération de votre programme personnalisé…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const weekOneActions = (plan?.actions ?? []).filter((a) => a.week === 1).slice(0, 3);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.successIconCircle}>
            <Ionicons name="checkmark-circle" size={56} color={Colors.primary} />
          </View>

          <Text style={styles.title}>Votre programme personnalisé est prêt</Text>
          <Text style={styles.subtitle}>
            Voici les 3 premières actions de votre semaine 1
          </Text>

          <View style={styles.actionsCard}>
            {weekOneActions.length > 0 ? (
              weekOneActions.map((action, index) => (
                <PreviewActionItem
                  key={action.id}
                  action={action}
                  isLast={index === weekOneActions.length - 1}
                />
              ))
            ) : (
              <Text style={styles.emptyText}>
                Votre programme est prêt, retrouvez-le dans l'onglet Plan.
              </Text>
            )}
          </View>

          <TouchableOpacity style={styles.ctaButton} onPress={handleContinue} activeOpacity={0.85}>
            <Text style={styles.ctaButtonText}>Voir mon programme complet →</Text>
          </TouchableOpacity>
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
    gap: 16,
    paddingHorizontal: 32,
  },
  loadingText: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 48,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 64,
    alignItems: 'center',
  },
  successIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  actionsCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 16,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  actionItemLast: {
    borderBottomWidth: 0,
  },
  actionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
    lineHeight: 20,
  },
  actionDuration: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 12,
  },
  ctaButton: {
    width: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 'auto',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
