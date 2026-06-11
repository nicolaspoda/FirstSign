import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// RGPD: never return per-member data below this threshold.
const MIN_MEMBERS = 10;

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

interface CheckinRow {
  user_id: string;
  week_number: number;
  year: number;
  energy: number | null;
  motivation: number | null;
  stress: number | null;
  work_life_balance: number | null;
}

// Same composite wellbeing score (1–10, higher = better) as lib/checkin.ts.
function wellbeingScore(c: CheckinRow): number {
  const values: number[] = [];
  if (c.energy != null) values.push(c.energy);
  if (c.motivation != null) values.push(c.motivation);
  if (c.stress != null) values.push(11 - c.stress);
  if (c.work_life_balance != null) values.push(c.work_life_balance);
  if (values.length === 0) return 5;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'UNAUTHORIZED', message: 'Token manquant.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'UNAUTHORIZED', message: 'Session invalide.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const user_id = user.id;

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: org, error: orgError } = await adminClient
      .from('organizations')
      .select('id, name, code')
      .eq('admin_user_id', user_id)
      .maybeSingle();
    if (orgError) throw orgError;

    if (!org) {
      return new Response(
        JSON.stringify({
          error: 'NOT_ADMIN',
          message: "Vous n'êtes pas administrateur d'une organisation.",
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: members, error: membersError } = await adminClient
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', org.id);
    if (membersError) throw membersError;

    const memberIds = (members ?? []).map((m) => m.user_id);

    if (memberIds.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'INSUFFICIENT_MEMBERS',
          message: `Pas assez de membres pour afficher les statistiques (minimum ${MIN_MEMBERS} requis).`,
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Latest assessment per member (most-recent-first, keep first occurrence per user).
    const { data: assessments, error: assessmentsError } = await adminClient
      .from('assessments')
      .select('user_id, total_score, risk_level, created_at')
      .in('user_id', memberIds)
      .order('created_at', { ascending: false });
    if (assessmentsError) throw assessmentsError;

    const latestByUser = new Map<string, { total_score: number; risk_level: RiskLevel }>();
    for (const a of assessments ?? []) {
      if (!latestByUser.has(a.user_id)) {
        latestByUser.set(a.user_id, { total_score: a.total_score, risk_level: a.risk_level as RiskLevel });
      }
    }

    if (latestByUser.size < MIN_MEMBERS) {
      return new Response(
        JSON.stringify({
          error: 'INSUFFICIENT_MEMBERS',
          message: `Pas assez de membres pour afficher les statistiques (minimum ${MIN_MEMBERS} requis).`,
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const totalMembers = latestByUser.size;

    const scores = [...latestByUser.values()].map((a) => a.total_score);
    const average_score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    const counts: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const a of latestByUser.values()) counts[a.risk_level]++;

    const risk_distribution = {
      low: Math.round((counts.low / totalMembers) * 100),
      medium: Math.round((counts.medium / totalMembers) * 100),
      high: Math.round((counts.high / totalMembers) * 100),
      critical: Math.round((counts.critical / totalMembers) * 100),
    };

    // Last 4 check-ins per member, used to build a team-wide weekly evolution.
    const { data: checkins, error: checkinsError } = await adminClient
      .from('checkins')
      .select('user_id, week_number, year, energy, motivation, stress, work_life_balance, created_at')
      .in('user_id', memberIds)
      .order('created_at', { ascending: false });
    if (checkinsError) throw checkinsError;

    const checkinsByUser = new Map<string, CheckinRow[]>();
    for (const c of (checkins ?? []) as (CheckinRow & { created_at: string })[]) {
      const list = checkinsByUser.get(c.user_id) ?? [];
      if (list.length < 4) {
        list.push(c);
        checkinsByUser.set(c.user_id, list);
      }
    }

    // Bucket every collected check-in by calendar week, average across members.
    const weekBuckets = new Map<string, number[]>();
    for (const list of checkinsByUser.values()) {
      for (const c of list) {
        const key = `${c.year}-${String(c.week_number).padStart(2, '0')}`;
        const arr = weekBuckets.get(key) ?? [];
        arr.push(wellbeingScore(c));
        weekBuckets.set(key, arr);
      }
    }

    const sortedWeekKeys = [...weekBuckets.keys()].sort().slice(-4);
    const weekly_evolution = sortedWeekKeys.map((key) => {
      const bucket = weekBuckets.get(key)!;
      const avg = bucket.reduce((a, b) => a + b, 0) / bucket.length;
      const weekNumber = parseInt(key.split('-')[1], 10);
      return { label: `S${weekNumber}`, score: Math.round(avg * 10) / 10 };
    });

    let team_trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (weekly_evolution.length >= 2) {
      const mid = Math.floor(weekly_evolution.length / 2);
      const older = weekly_evolution.slice(0, mid);
      const recent = weekly_evolution.slice(mid);
      const avgOlder = older.reduce((s, w) => s + w.score, 0) / older.length;
      const avgRecent = recent.reduce((s, w) => s + w.score, 0) / recent.length;
      const delta = avgRecent - avgOlder;
      if (delta > 0.5) team_trend = 'improving';
      else if (delta < -0.5) team_trend = 'declining';
    }

    return new Response(
      JSON.stringify({
        organization_name: org.name,
        invite_code: org.code,
        member_count: totalMembers,
        average_score,
        risk_distribution,
        high_risk_count: counts.high,
        critical_risk_count: counts.critical,
        team_trend,
        weekly_evolution,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
