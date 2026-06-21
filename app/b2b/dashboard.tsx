import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Colors } from "@/constants/colors";
import {
  getOrganizationDashboard,
  type B2BDashboard,
  type RiskDistribution,
  type TeamTrend,
} from "@/lib/b2b";
import type { RiskLevel } from "@/types/database";

const RISK_COLORS: Record<RiskLevel, string> = {
  low: Colors.severityNone,
  medium: Colors.severityMild,
  high: Colors.severityModerate,
  critical: Colors.severitySevere,
};

const RISK_LABELS: Record<RiskLevel, string> = {
  low: "Faible",
  medium: "Modéré",
  high: "Élevé",
  critical: "Critique",
};

const RISK_ORDER: RiskLevel[] = ["low", "medium", "high", "critical"];

const TREND_CONFIG: Record<TeamTrend, { label: string; color: string }> = {
  improving: { label: "↑ En amélioration", color: Colors.success },
  stable: { label: "→ Stable", color: Colors.textSecondary },
  declining: { label: "↓ En déclin", color: Colors.danger },
};

const CHART_HEIGHT = 100;

function getRiskLevelFromScore(score: number): RiskLevel {
  if (score >= 90) return "critical";
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}

function RiskDistributionChart({
  distribution,
}: {
  distribution: RiskDistribution;
}) {
  return (
    <View style={styles.chartBars}>
      {RISK_ORDER.map((level) => {
        const value = distribution[level];
        const barHeight = Math.max(4, (value / 100) * CHART_HEIGHT);
        return (
          <View key={level} style={styles.chartColumn}>
            <Text style={[styles.chartValue, { color: RISK_COLORS[level] }]}>
              {value}%
            </Text>
            <View style={styles.chartBarWrapper}>
              <View
                style={[
                  styles.chartBar,
                  { height: barHeight, backgroundColor: RISK_COLORS[level] },
                ]}
              />
            </View>
            <Text style={styles.chartLabel}>{RISK_LABELS[level]}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function B2BDashboardScreen() {
  const router = useRouter();
  const [data, setData] = useState<B2BDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code?: string; message: string } | null>(
    null,
  );
  const [showInviteCode, setShowInviteCode] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const dashboard = await getOrganizationDashboard();
      setData(dashboard);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const message =
        err instanceof Error
          ? err.message
          : "Une erreur est survenue. Veuillez réessayer.";
      setError({ code, message });
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleCopyCode() {
    if (!data) return;
    await Clipboard.setStringAsync(data.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
        <Text style={styles.headerTitle}>Dashboard équipe</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.gdprBanner}>
        <Ionicons
          name="shield-checkmark-outline"
          size={16}
          color={Colors.primaryDark}
        />
        <Text style={styles.gdprText}>
          Données anonymisées - aucun individu ne peut être identifié
        </Text>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Ionicons
            name={
              error.code === "INSUFFICIENT_MEMBERS"
                ? "people-outline"
                : "alert-circle-outline"
            }
            size={48}
            color={Colors.textMuted}
            style={styles.errorIcon}
          />
          <Text style={styles.errorTitle}>{error.message}</Text>
          {error.code === "INSUFFICIENT_MEMBERS" && (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push("/b2b/admin")}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Inviter des membres</Text>
            </TouchableOpacity>
          )}
          {error.code === "NOT_ADMIN" && (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push("/b2b/admin")}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>
                Gérer mon organisation
              </Text>
            </TouchableOpacity>
          )}
          {!error.code && (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={load}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Réessayer</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : data ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.orgName}>{data.organization_name}</Text>
          <Text style={styles.memberCount}>
            {data.member_count} membres avec données
          </Text>

          {/* Score moyen équipe */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Score moyen de l'équipe</Text>
            <View style={styles.scoreRow}>
              <Text
                style={[
                  styles.scoreValue,
                  {
                    color:
                      RISK_COLORS[getRiskLevelFromScore(data.average_score)],
                  },
                ]}
              >
                {data.average_score}
                <Text style={styles.scoreMax}>/100</Text>
              </Text>
            </View>
            <View style={styles.scoreBarTrack}>
              <View
                style={[
                  styles.scoreBarFill,
                  {
                    width: `${data.average_score}%` as any,
                    backgroundColor:
                      RISK_COLORS[getRiskLevelFromScore(data.average_score)],
                  },
                ]}
              />
            </View>
          </View>

          {/* Répartition des risques */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              Répartition des niveaux de risque
            </Text>
            <RiskDistributionChart distribution={data.risk_distribution} />
          </View>

          {/* Membres à risque */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Membres à risque</Text>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: RISK_COLORS.high }]}>
                  {data.high_risk_count}
                </Text>
                <Text style={styles.statLabel}>Risque élevé</Text>
              </View>
              <View style={styles.statBox}>
                <Text
                  style={[styles.statValue, { color: RISK_COLORS.critical }]}
                >
                  {data.critical_risk_count}
                </Text>
                <Text style={styles.statLabel}>Risque critique</Text>
              </View>
            </View>
          </View>

          {/* Tendance équipe */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Évolution sur 4 semaines</Text>
              <View
                style={[
                  styles.trendBadge,
                  {
                    backgroundColor: TREND_CONFIG[data.team_trend].color + "18",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.trendText,
                    { color: TREND_CONFIG[data.team_trend].color },
                  ]}
                >
                  {TREND_CONFIG[data.team_trend].label}
                </Text>
              </View>
            </View>
            {data.weekly_evolution.length >= 2 ? (
              <View style={styles.chartBars}>
                {data.weekly_evolution.map((point, idx) => {
                  const barHeight = Math.max(
                    8,
                    (point.score / 10) * CHART_HEIGHT,
                  );
                  return (
                    <View key={idx} style={styles.chartColumn}>
                      <Text style={styles.chartValue}>
                        {point.score.toFixed(1)}
                      </Text>
                      <View style={styles.chartBarWrapper}>
                        <View
                          style={[
                            styles.chartBar,
                            {
                              height: barHeight,
                              backgroundColor: Colors.primary,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.chartLabel}>{point.label}</Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.noDataText}>
                Pas encore assez de données de check-in
              </Text>
            )}
          </View>

          {/* Inviter des membres */}
          <TouchableOpacity
            style={styles.inviteCard}
            onPress={() => setShowInviteCode((v) => !v)}
            activeOpacity={0.85}
          >
            <View style={styles.inviteHeader}>
              <Ionicons
                name="person-add-outline"
                size={18}
                color={Colors.primary}
              />
              <Text style={styles.inviteTitle}>Inviter des membres</Text>
              <Ionicons
                name={showInviteCode ? "chevron-up" : "chevron-down"}
                size={18}
                color={Colors.textSecondary}
              />
            </View>
            {showInviteCode && (
              <View style={styles.inviteBody}>
                <Text style={styles.inviteCode}>{data.invite_code}</Text>
                <TouchableOpacity
                  style={styles.copyButton}
                  onPress={handleCopyCode}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={copied ? "checkmark" : "copy-outline"}
                    size={16}
                    color={Colors.primary}
                  />
                  <Text style={styles.copyButtonText}>
                    {copied ? "Copié !" : "Copier le code"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.text,
  },
  gdprBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.primaryLight,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  gdprText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: Colors.primaryDark,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  errorIcon: {
    marginBottom: 4,
  },
  errorTitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  orgName: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.text,
    marginTop: 8,
  },
  memberCount: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 16,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: "800",
    lineHeight: 56,
  },
  scoreMax: {
    fontSize: 22,
    fontWeight: "400",
    color: Colors.textMuted,
  },
  scoreBarTrack: {
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: 4,
    overflow: "hidden",
  },
  scoreBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  chartBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    height: CHART_HEIGHT + 48,
  },
  chartColumn: {
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  chartValue: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  chartBarWrapper: {
    height: CHART_HEIGHT,
    justifyContent: "flex-end",
    width: "60%",
  },
  chartBar: {
    borderRadius: 4,
    minHeight: 4,
  },
  chartLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: "500",
  },
  noDataText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    paddingVertical: 16,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  statBox: {
    flex: 1,
    alignItems: "center",
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 14,
    paddingVertical: 16,
  },
  statValue: {
    fontSize: 32,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  trendBadge: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  trendText: {
    fontSize: 12,
    fontWeight: "700",
  },
  inviteCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inviteHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  inviteTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: Colors.text,
  },
  inviteBody: {
    marginTop: 16,
    alignItems: "center",
    gap: 12,
  },
  inviteCode: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 6,
    color: Colors.primary,
  },
  copyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primaryLight,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  copyButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.primary,
  },
});
