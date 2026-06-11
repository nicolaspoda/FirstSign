import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { canAccess } from '@/lib/subscription';
import {
  EXERCISES,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  type Exercise,
  type ExerciseCategory,
  type ExerciseLevel,
} from '@/lib/exercises';
import PaywallModal from '@/components/PaywallModal';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const CATEGORY_ICONS: Record<ExerciseCategory, IoniconsName> = {
  breathing: 'pulse-outline',
  mindfulness: 'leaf-outline',
  cognitive: 'bulb-outline',
};

const LEVEL_COLORS: Record<ExerciseLevel, string> = {
  'débutant': Colors.success,
  'intermédiaire': Colors.warning,
  'avancé': Colors.danger,
};

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

interface ExerciseCardProps {
  exercise: Exercise;
  onStart: () => void;
}

function ExerciseCard({ exercise, onStart }: ExerciseCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{exercise.title}</Text>
        <View style={[styles.levelBadge, { borderColor: LEVEL_COLORS[exercise.level] }]}>
          <Text style={[styles.levelBadgeText, { color: LEVEL_COLORS[exercise.level] }]}>
            {exercise.level}
          </Text>
        </View>
      </View>
      <Text style={styles.cardDescription}>{exercise.description}</Text>
      <View style={styles.cardFooter}>
        <View style={styles.durationRow}>
          <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.durationText}>{exercise.duration} min</Text>
        </View>
        <TouchableOpacity style={styles.startButton} onPress={onStart} activeOpacity={0.85}>
          <Text style={styles.startButtonText}>Commencer</Text>
          <Ionicons name="play" size={13} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface ExerciseModalProps {
  exercise: Exercise | null;
  onClose: () => void;
}

function ExerciseModal({ exercise, onClose }: ExerciseModalProps) {
  const [remaining, setRemaining] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (exercise) {
      setRemaining(exercise.duration * 60);
      setRunning(false);
    }
  }, [exercise]);

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          setRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [running]);

  if (!exercise) return null;

  const totalSeconds = exercise.duration * 60;
  const progress = totalSeconds > 0 ? (totalSeconds - remaining) / totalSeconds : 0;

  function handleClose() {
    setRunning(false);
    onClose();
  }

  function handleReset() {
    setRunning(false);
    setRemaining(totalSeconds);
  }

  return (
    <Modal visible={exercise !== null} animationType="slide" onRequestClose={handleClose} statusBarTranslucent>
      <SafeAreaProvider>
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.backButton}
            >
              <Ionicons name="chevron-back" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalHeaderTitle} numberOfLines={1}>
              {exercise.title}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.timerCard}>
              <Text style={styles.timerText}>{formatTime(remaining)}</Text>
              <View style={styles.timerTrack}>
                <View style={[styles.timerFill, { width: `${progress * 100}%` as any }]} />
              </View>
              <View style={styles.timerControls}>
                <TouchableOpacity style={styles.timerButton} onPress={handleReset} activeOpacity={0.8}>
                  <Ionicons name="refresh" size={20} color={Colors.text} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.timerButton, styles.timerButtonPrimary]}
                  onPress={() => setRunning((r) => !r)}
                  activeOpacity={0.85}
                >
                  <Ionicons name={running ? 'pause' : 'play'} size={22} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.modalSectionTitle}>Instructions</Text>
            {exercise.instructions.map((step, idx) => (
              <View key={idx} style={styles.stepRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>{idx + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

export default function ExercisesScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [activeExercise, setActiveExercise] = useState<Exercise | null>(null);

  useEffect(() => {
    canAccess('exercises').then((ok) => {
      setHasAccess(ok);
      setLoading(false);
      if (!ok) setShowPaywall(true);
    });
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!hasAccess) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Bibliothèque d'exercices</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerContainer}>
          <Ionicons name="lock-closed" size={48} color={Colors.textMuted} style={styles.emptyIcon} />
          <Text style={styles.emptyTitle}>Fonctionnalité Premium</Text>
          <Text style={styles.emptySubtitle}>
            Débloquez la bibliothèque d'exercices de respiration, de pleine conscience et de
            restructuration cognitive.
          </Text>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => setShowPaywall(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaButtonText}>Débloquer</Text>
          </TouchableOpacity>
        </View>
        <PaywallModal
          visible={showPaywall}
          onClose={() => setShowPaywall(false)}
          onSuccess={() => {
            setShowPaywall(false);
            setHasAccess(true);
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bibliothèque d'exercices</Text>
        <View style={styles.premiumBadge}>
          <Ionicons name="star" size={12} color={Colors.primary} />
          <Text style={styles.premiumBadgeText}>Premium</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {CATEGORY_ORDER.map((category) => (
          <View key={category} style={styles.categorySection}>
            <View style={styles.categoryHeader}>
              <Ionicons name={CATEGORY_ICONS[category]} size={18} color={Colors.primary} />
              <Text style={styles.categoryTitle}>{CATEGORY_LABELS[category]}</Text>
            </View>
            {EXERCISES.filter((exercise) => exercise.category === category).map((exercise) => (
              <ExerciseCard
                key={exercise.id}
                exercise={exercise}
                onStart={() => setActiveExercise(exercise)}
              />
            ))}
          </View>
        ))}
      </ScrollView>

      <ExerciseModal exercise={activeExercise} onClose={() => setActiveExercise(null)} />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryLight,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  premiumBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
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
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  categorySection: {
    marginBottom: 20,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  levelBadge: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  levelBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  cardDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  durationText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  startButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Modal
  modalSafeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalHeaderTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  modalContent: {
    padding: 16,
    paddingBottom: 32,
  },
  timerCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  timerText: {
    fontSize: 40,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 16,
    fontVariant: ['tabular-nums'],
  },
  timerTrack: {
    width: '100%',
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 20,
  },
  timerFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  timerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  timerButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerButtonPrimary: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
  },
  modalSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  stepBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
    lineHeight: 21,
  },
});
