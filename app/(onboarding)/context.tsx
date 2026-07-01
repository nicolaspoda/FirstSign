import { useState } from 'react';
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
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { generateActionPlan } from '@/lib/api';
import type { RemoteWork } from '@/types/database';
import PaywallModal from '@/components/PaywallModal';

const SECTOR_OPTIONS = ['Tech', 'Finance', 'Santé', 'Éducation', 'Commerce', 'Industrie', 'Autre'];

const REMOTE_WORK_OPTIONS: { label: string; value: RemoteWork }[] = [
  { label: 'En présentiel', value: 'no' },
  { label: 'Hybride', value: 'hybrid' },
  { label: 'Full remote', value: 'yes' },
];

const ROLE_OPTIONS: { label: string; value: boolean }[] = [
  { label: 'Salarié', value: false },
  { label: 'Manager / Responsable d\'équipe', value: true },
];

const STRESS_SOURCE_OPTIONS = [
  'Surcharge de travail',
  'Relations avec les collègues',
  'Manque de reconnaissance',
  'Incertitude / changements',
  'Autre',
];

interface ProfileContextUpdate {
  sector: string | null;
  remote_work: RemoteWork | null;
  is_manager: boolean | null;
  main_stress_source: string | null;
}

interface OptionButtonProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

function OptionButton({ label, selected, onPress }: OptionButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.optionButton, selected && styles.optionButtonSelected]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function ContextScreen() {
  const router = useRouter();
  const { assessmentId } = useLocalSearchParams<{ assessmentId: string }>();
  const [sector, setSector] = useState<string | null>(null);
  const [remoteWork, setRemoteWork] = useState<RemoteWork | null>(null);
  const [isManager, setIsManager] = useState<boolean | null>(null);
  const [stressSource, setStressSource] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  const allAnswered =
    sector !== null && remoteWork !== null && isManager !== null && stressSource !== null;

  async function proceedToPlan() {
    if (!assessmentId) {
      router.replace('/(tabs)');
      return;
    }

    const { data: existingPlan } = await supabase
      .from('action_plans')
      .select('id')
      .eq('assessment_id', assessmentId)
      .maybeSingle();

    if (!existingPlan) {
      generateActionPlan(assessmentId).catch(() => {});
    }

    router.replace({ pathname: '/(onboarding)/plan-preview', params: { assessmentId } });
  }

  async function saveAndProceed(values: ProfileContextUpdate) {
    setError(null);
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').update(values).eq('user_id', user.id);
      }
      await proceedToPlan();
    } catch (err: any) {
      if (err?.status === 403 || err?.message?.includes('premium')) {
        setShowPaywall(true);
      } else {
        setError(err?.message ?? 'Impossible de continuer. Réessayez.');
      }
    } finally {
      setSaving(false);
    }
  }

  function handleContinue() {
    if (!allAnswered || saving) return;
    saveAndProceed({
      sector,
      remote_work: remoteWork,
      is_manager: isManager,
      main_stress_source: stressSource,
    });
  }

  function handleSkip() {
    if (saving) return;
    saveAndProceed({ sector: null, remote_work: null, is_manager: null, main_stress_source: null });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleSkip}
          disabled={saving}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.skipText}>Passer</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Personnalisez votre accompagnement</Text>
          <Text style={styles.pageSubtitle}>4 questions rapides pour adapter votre plan</Text>
        </View>

        <View style={styles.questionBlock}>
          <Text style={styles.questionLabel}>Quel est votre secteur d'activité ?</Text>
          <View style={styles.optionsContainer}>
            {SECTOR_OPTIONS.map((option) => (
              <OptionButton
                key={option}
                label={option}
                selected={sector === option}
                onPress={() => setSector(option)}
              />
            ))}
          </View>
        </View>

        <View style={styles.questionBlock}>
          <Text style={styles.questionLabel}>Travaillez-vous en télétravail ?</Text>
          <View style={styles.optionsContainer}>
            {REMOTE_WORK_OPTIONS.map((option) => (
              <OptionButton
                key={option.value}
                label={option.label}
                selected={remoteWork === option.value}
                onPress={() => setRemoteWork(option.value)}
              />
            ))}
          </View>
        </View>

        <View style={styles.questionBlock}>
          <Text style={styles.questionLabel}>Quel est votre rôle ?</Text>
          <View style={styles.optionsContainer}>
            {ROLE_OPTIONS.map((option) => (
              <OptionButton
                key={option.label}
                label={option.label}
                selected={isManager === option.value}
                onPress={() => setIsManager(option.value)}
              />
            ))}
          </View>
        </View>

        <View style={styles.questionBlock}>
          <Text style={styles.questionLabel}>Quelle est votre principale source de stress ?</Text>
          <View style={styles.optionsContainer}>
            {STRESS_SOURCE_OPTIONS.map((option) => (
              <OptionButton
                key={option}
                label={option}
                selected={stressSource === option}
                onPress={() => setStressSource(option)}
              />
            ))}
          </View>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.ctaButton, (!allAnswered || saving) && styles.ctaButtonDisabled]}
          onPress={handleContinue}
          disabled={!allAnswered || saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.ctaButtonText}>Continuer →</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <PaywallModal
        visible={showPaywall}
        onClose={() => {
          setShowPaywall(false);
          router.replace('/(tabs)');
        }}
        onSuccess={() => {
          setShowPaywall(false);
          proceedToPlan().catch((err: any) => {
            setError(err?.message ?? 'Impossible de continuer. Réessayez.');
          });
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
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  skipText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textSecondary,
    paddingVertical: 8,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  pageHeader: {
    marginBottom: 28,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 8,
  },
  pageSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  questionBlock: {
    marginBottom: 28,
  },
  questionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
  },
  optionsContainer: {
    gap: 10,
  },
  optionButton: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionButtonSelected: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  optionLabel: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
    lineHeight: 20,
  },
  optionLabelSelected: {
    color: Colors.primary,
    fontWeight: '600',
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
    marginTop: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  ctaButtonDisabled: {
    opacity: 0.4,
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
