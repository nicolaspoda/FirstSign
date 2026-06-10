import { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { useBurnoutData } from '@/hooks/useBurnoutData';
import { canAccess } from '@/lib/subscription';
import { wellbeingScore } from '@/lib/checkin';
import type { Checkin } from '@/types/database';
import PaywallModal from '@/components/PaywallModal';

const FREE_LIMIT = 2;

function getScoreColor(score: number): string {
  if (score >= 8) return Colors.severityNone;
  if (score >= 6) return Colors.severityMild;
  if (score >= 4) return Colors.warning;
  return Colors.danger;
}

interface MiniBar {
  label: string;
  value: number | null;
  max?: number;
  inverted?: boolean;
}

function CheckinCard({ checkin }: { checkin: Checkin }) {
  const ws = wellbeingScore(checkin);
  const scoreColor = getScoreColor(ws);

  const date = new Date(checkin.created_at);
  const dateLabel = date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const bars: MiniBar[] = [
    { label: 'Énergie', value: checkin.energy, max: 10 },
    { label: 'Motivation', value: checkin.motivation, max: 10 },
    { label: 'Stress', value: checkin.stress, max: 10, inverted: true },
    { label: 'Équilibre', value: checkin.work_life_balance, max: 10 },
  ];

  return (
    <View style={styles.checkinCard}>
      <View style={styles.checkinHeader}>
        <View>
          <Text style={styles.checkinDate}>{dateLabel}</Text>
          <Text style={styles.checkinWeek}>Semaine {checkin.week_number}</Text>
        </View>
        <View style={[styles.scoreBadge, { backgroundColor: scoreColor + '22' }]}>
          <Text style={[styles.scoreValue, { color: scoreColor }]}>{ws.toFixed(1)}</Text>
          <Text style={[styles.scoreMax, { color: scoreColor }]}>/10</Text>
        </View>
      </View>

      <View style={styles.barsContainer}>
        {bars.map((bar) => {
          if (bar.value == null) return null;
          const ratio = bar.inverted
            ? 1 - (bar.value - 1) / (bar.max! - 1)
            : (bar.value - 1) / (bar.max! - 1);
          const barColor = bar.inverted
            ? ratio > 0.6 ? Colors.danger : ratio > 0.3 ? Colors.warning : Colors.success
            : ratio > 0.6 ? Colors.success : ratio > 0.3 ? Colors.warning : Colors.danger;

          return (
            <View key={bar.label} style={styles.miniBarRow}>
              <Text style={styles.miniBarLabel}>{bar.label}</Text>
              <View style={styles.miniBarTrack}>
                <View
                  style={[
                    styles.miniBarFill,
                    { width: `${ratio * 100}%` as any, backgroundColor: barColor },
                  ]}
                />
              </View>
              <Text style={[styles.miniBarValue, { color: barColor }]}>{bar.value}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function HistoryScreen() {
  const { recentCheckins, loading } = useBurnoutData();
  const [isPremium, setIsPremium] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  useEffect(() => {
    canAccess('checkin_history').then((access) => {
      setIsPremium(access);
      setCheckingAccess(false);
    });
  }, []);

  const visibleCheckins = isPremium ? recentCheckins : recentCheckins.slice(0, FREE_LIMIT);
  const hasMore = !isPremium && recentCheckins.length > FREE_LIMIT;

  if (loading || checkingAccess) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Historique</Text>
        <Text style={styles.pageSubtitle}>Suivi de votre bien-être hebdomadaire</Text>
      </View>

      <FlatList
        data={visibleCheckins}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <CheckinCard checkin={item} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Aucun check-in enregistré</Text>
            <Text style={styles.emptySubtext}>
              Faites votre premier check-in depuis l'onglet Accueil
            </Text>
          </View>
        }
        ListFooterComponent={
          hasMore ? (
            <TouchableOpacity style={styles.premiumBlock} onPress={() => setShowPaywall(true)}>
              <Ionicons name="lock-closed" size={26} color={Colors.textMuted} style={styles.premiumLockIcon} />
              <Text style={styles.premiumTitle}>Historique complet — Premium</Text>
              <Text style={styles.premiumSubtitle}>
                Accédez à tout votre historique sans limite
              </Text>
              <View style={styles.unlockButton}>
                <Text style={styles.unlockButtonText}>Débloquer</Text>
              </View>
            </TouchableOpacity>
          ) : null
        }
      />

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
  },
  pageHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.text,
  },
  pageSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  checkinCard: {
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
  checkinHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  checkinDate: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    textTransform: 'capitalize',
  },
  checkinWeek: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 2,
  },
  scoreValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  scoreMax: {
    fontSize: 12,
    fontWeight: '500',
  },
  barsContainer: {
    gap: 8,
  },
  miniBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniBarLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    width: 72,
  },
  miniBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  miniBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  miniBarValue: {
    fontSize: 12,
    fontWeight: '700',
    width: 16,
    textAlign: 'right',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 48,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 20,
  },
  premiumBlock: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    marginTop: 4,
    gap: 8,
  },
  premiumLockIcon: {
    marginBottom: 2,
  },
  premiumTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  premiumSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  unlockButton: {
    marginTop: 8,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  unlockButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
