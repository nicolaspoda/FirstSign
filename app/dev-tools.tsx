import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Colors } from '@/constants/colors';
import { CBI_QUESTIONS, calculateScores, getRiskLevel } from '@/lib/burnout';

// ─── ISO week helper ──────────────────────────────────────────────────────────

function isoWeekForOffset(weeksBack: number): {
  week_number: number;
  year: number;
  created_at: string;
} {
  const d = new Date();
  d.setDate(d.getDate() - weeksBack * 7);

  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week_number = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));

  return { week_number, year: utc.getUTCFullYear(), created_at: monday.toISOString() };
}

// ─── Confirm helper (works on both web and native) ───────────────────────────

function devConfirm(message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-restricted-globals
    if (window.confirm(message)) onConfirm();
  } else {
    Alert.alert('Confirmer', message, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Confirmer', style: 'destructive', onPress: onConfirm },
    ]);
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DevToolsScreen() {
  // Safety guard — Metro strips this branch entirely in production builds
  if (!__DEV__) return null;

  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function run(id: string, fn: (userId: string) => Promise<void>) {
    if (!user) return;
    setLoading(id);
    setResult(null);
    try {
      await fn(user.id);
      setResult({ ok: true, msg: 'Succès !' });
    } catch (err: any) {
      setResult({ ok: false, msg: err?.message ?? 'Erreur inconnue' });
    } finally {
      setLoading(null);
    }
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  async function simulateFourWeeks(userId: string) {
    const weeks = [
      // weeksBack, energy, motivation, stress, work_life_balance
      [4, 3, 2, 8, 2],
      [3, 4, 4, 7, 3],
      [2, 6, 5, 5, 5],
      [1, 7, 6, 4, 7],
    ] as const;

    const rows = weeks.map(([back, energy, motivation, stress, balance]) => {
      const { week_number, year, created_at } = isoWeekForOffset(back);
      return {
        user_id: userId,
        week_number,
        year,
        energy,
        motivation,
        stress,
        work_life_balance: balance,
        created_at,
      };
    });

    const { error } = await supabase
      .from('checkins')
      .upsert(rows, { onConflict: 'user_id,year,week_number' });
    if (error) throw error;
  }

  async function simulateDegradation(userId: string) {
    // 3 check-ins chutant monotoniquement → shouldAlert() = true
    const weeks = [
      [3, 8, 8, 3, 8],  // wellbeing 8.0
      [2, 5, 5, 6, 5],  // wellbeing 5.0
      [1, 3, 3, 8, 3],  // wellbeing 3.0  → alerte rouge
    ] as const;

    const rows = weeks.map(([back, energy, motivation, stress, balance]) => {
      const { week_number, year, created_at } = isoWeekForOffset(back);
      return {
        user_id: userId,
        week_number,
        year,
        energy,
        motivation,
        stress,
        work_life_balance: balance,
        created_at,
      };
    });

    const { error } = await supabase
      .from('checkins')
      .upsert(rows, { onConflict: 'user_id,year,week_number' });
    if (error) throw error;
  }

  async function createSecondDiagnostic(userId: string) {
    // 19 réponses CBI (0/25/50/75/100) — profil "critique" sur les 3 dimensions.
    // work_7 (index 17, "énergie pour la famille/les amis") est inversée :
    // une réponse à 0 ("Jamais ou presque jamais") donne 100 points de burnout.
    const answers = new Array(CBI_QUESTIONS.length).fill(100);
    answers[17] = 0;

    const scores = calculateScores(answers);
    const risk = getRiskLevel(scores);

    const { error } = await supabase.from('assessments').insert({
      user_id: userId,
      exhaustion_score: scores.personal,
      cynicism_score: scores.work,
      efficacy_score: scores.relations,
      total_score: scores.totalScore,
      risk_level: risk.level,
    });
    if (error) throw error;
  }

  async function simulateSevereDecline(userId: string) {
    // 4 check-ins en fort déclin → active le modificateur tendance +15
    // + stress moyen 8.5 > 7 (+10) + énergie moyenne 2.5 < 4 (+10) + motivation 2.5 < 4 (+5)
    const weeks = [
      [4, 5, 5, 6, 5],  // il y a 4 semaines : encore correct
      [3, 4, 4, 7, 4],  // il y a 3 semaines : début de dégradation
      [2, 2, 2, 9, 2],  // il y a 2 semaines : fort déclin
      [1, 2, 2, 9, 2],  // semaine dernière : critique
    ] as const;

    const rows = weeks.map(([back, energy, motivation, stress, balance]) => {
      const { week_number, year, created_at } = isoWeekForOffset(back);
      return {
        user_id: userId,
        week_number,
        year,
        energy,
        motivation,
        stress,
        work_life_balance: balance,
        created_at,
      };
    });

    const { error } = await supabase
      .from('checkins')
      .upsert(rows, { onConflict: 'user_id,year,week_number' });
    if (error) throw error;
  }

  async function setPremium(userId: string) {
    const { error } = await supabase
      .from('profiles')
      .update({ subscription_tier: 'premium' })
      .eq('user_id', userId);
    if (error) throw error;
  }

  async function setFree(userId: string) {
    const { error } = await supabase
      .from('profiles')
      .update({ subscription_tier: 'free' })
      .eq('user_id', userId);
    if (error) throw error;
  }

  async function deleteTestData(userId: string) {
    // Sequential, not Promise.all: firing several concurrent HTTPS requests
    // to the same host from a physical device over Wi-Fi can trip "Network
    // request failed" on Expo Go. One request at a time is reliable, and the
    // table name in the error makes a real failure easy to pinpoint.
    const tables = ['checkins', 'assessments', 'ai_conversations', 'action_plans'] as const;
    for (const table of tables) {
      const { error } = await supabase.from(table).delete().eq('user_id', userId);
      if (error) throw new Error(`${table}: ${error.message}`);
    }
  }

  async function resetAll(userId: string) {
    await deleteTestData(userId);
    // Clear local cache
    await AsyncStorage.multiRemove([
      `burnout_data_${userId}`,
      'pending_assessment_answers',
    ]);
  }

  async function createTestOrg(_userId: string) {
    const { createOrganization, getMyOrganizationInfo } = await import('@/lib/b2b');
    const existing = await getMyOrganizationInfo();
    if (existing) throw new Error('Tu as déjà une organisation. Supprime-la d\'abord.');
    await createOrganization('Entreprise Test');
  }

  async function seedOrgMembers(_userId: string) {
    const { error, data } = await supabase.functions.invoke('dev-seed-org', {
      body: { action: 'seed' },
    });
    if (error) {
      const msg = typeof data?.message === 'string' ? data.message : error.message;
      throw new Error(msg);
    }
  }

  async function cleanOrgMembers(_userId: string) {
    const { error, data } = await supabase.functions.invoke('dev-seed-org', {
      body: { action: 'clean' },
    });
    if (error) {
      const msg = typeof data?.message === 'string' ? data.message : error.message;
      throw new Error(msg);
    }
  }

  async function deleteOrg(_userId: string) {
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) throw new Error('Non connecté');
    // Clean ghost members first, then delete the org (cascade handles members)
    await supabase.functions.invoke('dev-seed-org', { body: { action: 'clean' } });
    const { error } = await supabase.from('organizations').delete().eq('admin_user_id', u.id);
    if (error) throw error;
  }

  async function forceDeleteAllOrgs(_userId: string) {
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) throw new Error('Non connecté');
    // Best-effort ghost cleanup (ignore errors — org may be corrupted)
    await supabase.functions.invoke('dev-seed-org', { body: { action: 'clean' } }).catch(() => {});
    const { data: orgs, error: listErr } = await supabase
      .from('organizations')
      .select('id')
      .eq('admin_user_id', u.id);
    if (listErr) throw listErr;
    for (const org of orgs ?? []) {
      const { error } = await supabase.from('organizations').delete().eq('id', org.id);
      if (error) throw error;
    }
  }

  // ── UI helpers ───────────────────────────────────────────────────────────

  type BtnVariant = 'primary' | 'secondary' | 'danger' | 'warning';

  function Btn({
    id,
    label,
    sublabel,
    variant = 'primary',
    confirmMsg,
    action,
  }: {
    id: string;
    label: string;
    sublabel?: string;
    variant?: BtnVariant;
    confirmMsg: string;
    action: (userId: string) => Promise<void>;
  }) {
    const isRunning = loading === id;
    const disabled = loading !== null;
    const s = btnVariantStyles[variant];

    return (
      <TouchableOpacity
        style={[styles.btn, s.btn, disabled && styles.btnDisabled]}
        onPress={() => devConfirm(confirmMsg, () => run(id, action))}
        disabled={disabled}
        activeOpacity={0.8}
      >
        {isRunning ? (
          <ActivityIndicator color={s.spinnerColor} size="small" />
        ) : (
          <View>
            <Text style={[styles.btnLabel, s.label]}>{label}</Text>
            {sublabel ? <Text style={[styles.btnSublabel, s.sublabel]}>{sublabel}</Text> : null}
          </View>
        )}
      </TouchableOpacity>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.back}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Mode dev</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Result banner */}
        {result && (
          <View style={[styles.resultBanner, result.ok ? styles.resultOk : styles.resultErr]}>
            <Text style={styles.resultText}>{result.msg}</Text>
          </View>
        )}

        {/* Section 1 */}
        <Text style={styles.sectionTitle}>Remplir les données de test</Text>

        <Btn
          id="4weeks"
          label="Simuler 4 semaines de check-ins"
          sublabel="Trend croissant : 2.5 → 3.75 → 5.5 → 6.75"
          confirmMsg="Insérer 4 semaines de check-ins ? Les données existantes pour ces semaines seront écrasées."
          action={simulateFourWeeks}
        />

        <Btn
          id="degradation"
          label="Simuler une dégradation rapide"
          sublabel="Déclenche l'alerte rouge du dashboard"
          variant="warning"
          confirmMsg="Insérer 3 check-ins en forte chute ? Écrase les 3 dernières semaines."
          action={simulateDegradation}
        />

        <Btn
          id="severeDecline"
          label="4 semaines de déclin sévère"
          sublabel="Score prédictif → Critique (tendance +15, stress +10, énergie +10)"
          variant="warning"
          confirmMsg="Insérer 4 check-ins en fort déclin ? Écrase les 4 dernières semaines."
          action={simulateSevereDecline}
        />

        <Btn
          id="diagnostic2"
          label="Créer un 2ème diagnostic"
          sublabel="Risque critique (CBI 100/100/100)"
          confirmMsg="Créer un deuxième assessment dans l'historique ?"
          action={createSecondDiagnostic}
        />

        <Btn
          id="premium"
          label="Simuler utilisateur premium"
          sublabel="Active toutes les features dans la DB"
          variant="secondary"
          confirmMsg="Passer le compte en Premium dans la DB ?"
          action={setPremium}
        />

        <Btn
          id="free"
          label="Simuler utilisateur gratuit"
          sublabel="Remet le compte en Free"
          variant="secondary"
          confirmMsg="Repasser le compte en Free ?"
          action={setFree}
        />

        {/* Section 2 — Organisation B2B */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Organisation B2B</Text>

        <Btn
          id="createOrg"
          label="Créer une organisation de test"
          sublabel={'"Entreprise Test" — si tu n\'en as pas encore'}
          variant="secondary"
          confirmMsg="Créer l'organisation « Entreprise Test » ?"
          action={createTestOrg}
        />

        <Btn
          id="seedMembers"
          label="Simuler 10 membres avec données"
          sublabel="3 low · 4 medium · 2 high · 1 critical — débloque le dashboard"
          confirmMsg="Créer 10 membres fantômes dans ton organisation ? (nécessite d'avoir une org)"
          action={seedOrgMembers}
        />

        <TouchableOpacity
          style={[styles.btn, btnVariantStyles.secondary.btn]}
          onPress={() => router.push('/b2b/admin')}
          activeOpacity={0.8}
        >
          <Text style={[styles.btnLabel, btnVariantStyles.secondary.label]}>Aller sur l'admin B2B</Text>
          <Text style={[styles.btnSublabel, btnVariantStyles.secondary.sublabel]}>Gérer l'organisation et voir le code</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, btnVariantStyles.secondary.btn]}
          onPress={() => router.push('/b2b/dashboard')}
          activeOpacity={0.8}
        >
          <Text style={[styles.btnLabel, btnVariantStyles.secondary.label]}>Aller sur le dashboard équipe</Text>
          <Text style={[styles.btnSublabel, btnVariantStyles.secondary.sublabel]}>Voir les stats (10 membres requis)</Text>
        </TouchableOpacity>

        <Btn
          id="cleanMembers"
          label="Supprimer les membres simulés"
          sublabel="Efface les 10 ghosts et leurs données"
          variant="warning"
          confirmMsg="Supprimer tous les membres fantômes et leurs données ?"
          action={cleanOrgMembers}
        />

        <Btn
          id="forceDeleteAllOrgs"
          label="Reset urgence — toutes mes orgs"
          sublabel="Efface toutes les orgs si tu en as plusieurs (état incohérent)"
          variant="danger"
          confirmMsg="Supprimer TOUTES tes organisations et leurs membres ? À utiliser uniquement pour corriger un état incohérent."
          action={forceDeleteAllOrgs}
        />

        <Btn
          id="deleteOrg"
          label="Supprimer mon organisation"
          sublabel="Efface l'org, les membres et leurs données"
          variant="danger"
          confirmMsg="Supprimer définitivement l'organisation et tous ses membres ?"
          action={deleteOrg}
        />

        {/* Section 3 */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Nettoyer</Text>

        <Btn
          id="deleteData"
          label="Supprimer toutes mes données de test"
          sublabel="Efface check-ins, diagnostics et conversations"
          variant="danger"
          confirmMsg="Supprimer définitivement tous les check-ins, diagnostics et conversations ? Le compte reste intact."
          action={deleteTestData}
        />

        <Btn
          id="resetAll"
          label="Reset complet"
          sublabel="Données + cache local — état nouvel utilisateur"
          variant="danger"
          confirmMsg="Reset complet ? Toutes les données et le cache local seront effacés. Le compte reste."
          action={resetAll}
        />

        <Text style={styles.footer}>
          Ces outils ne sont visibles qu'en mode développement ({'\n'}
          <Text style={{ fontWeight: '700' }}>__DEV__ === true</Text>
          ) et sont absents du build production.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Variant styles ───────────────────────────────────────────────────────────

const btnVariantStyles: Record<
  'primary' | 'secondary' | 'danger' | 'warning',
  { btn: object; label: object; sublabel: object; spinnerColor: string }
> = {
  primary: {
    btn: { backgroundColor: Colors.primary },
    label: { color: '#FFFFFF' },
    sublabel: { color: 'rgba(255,255,255,0.75)' },
    spinnerColor: '#FFFFFF',
  },
  secondary: {
    btn: { backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border },
    label: { color: Colors.text },
    sublabel: { color: Colors.textMuted },
    spinnerColor: Colors.text,
  },
  warning: {
    btn: { backgroundColor: '#F59E0B' },
    label: { color: '#FFFFFF' },
    sublabel: { color: 'rgba(255,255,255,0.8)' },
    spinnerColor: '#FFFFFF',
  },
  danger: {
    btn: { backgroundColor: Colors.danger },
    label: { color: '#FFFFFF' },
    sublabel: { color: 'rgba(255,255,255,0.75)' },
    spinnerColor: '#FFFFFF',
  },
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  back: {
    fontSize: 15,
    color: Colors.primary,
    fontWeight: '600',
    width: 60,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  resultBanner: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  resultOk: {
    backgroundColor: '#052E16',
    borderWidth: 1,
    borderColor: '#16A34A',
  },
  resultErr: {
    backgroundColor: '#1C0505',
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  resultText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  btn: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    minHeight: 56,
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  btnSublabel: {
    fontSize: 12,
    marginTop: 2,
  },
  footer: {
    marginTop: 32,
    fontSize: 11,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 18,
  },
});
