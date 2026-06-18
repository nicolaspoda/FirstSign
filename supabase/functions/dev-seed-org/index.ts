import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// DEV-ONLY edge function — seeds or cleans 10 ghost members for B2B dashboard testing.
// Ghost users are identified by the email suffix "@dev.burnout.local" so cleanup is safe.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GHOST_DOMAIN = 'dev.burnout.local';
const GHOST_COUNT = 10;

// ISO week helpers (same logic as dev-tools.tsx)
function isoWeekForOffset(weeksBack: number): { week_number: number; year: number; created_at: string } {
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

// 10 member profiles with realistic variance across risk levels
const MEMBER_PROFILES = [
  // low risk (3)
  { exhaustion: 20, cynicism: 15, efficacy: 18, total: 18, risk: 'low',     checkins: [[4,8,8,3,8],[3,7,8,3,7],[2,8,7,2,8],[1,7,8,3,8]] },
  { exhaustion: 30, cynicism: 25, efficacy: 28, total: 28, risk: 'low',     checkins: [[4,7,7,4,7],[3,6,7,4,7],[2,7,6,3,7],[1,6,7,4,7]] },
  { exhaustion: 40, cynicism: 38, efficacy: 35, total: 38, risk: 'low',     checkins: [[4,6,6,4,6],[3,6,6,5,6],[2,5,6,4,5],[1,6,5,4,6]] },
  // medium risk (4)
  { exhaustion: 55, cynicism: 50, efficacy: 48, total: 51, risk: 'medium',  checkins: [[4,5,5,6,5],[3,5,4,6,5],[2,4,5,6,5],[1,5,4,6,5]] },
  { exhaustion: 60, cynicism: 58, efficacy: 55, total: 58, risk: 'medium',  checkins: [[4,4,5,6,4],[3,4,4,7,5],[2,5,4,6,4],[1,4,5,7,4]] },
  { exhaustion: 65, cynicism: 62, efficacy: 60, total: 62, risk: 'medium',  checkins: [[4,4,4,7,4],[3,4,4,7,4],[2,3,4,7,4],[1,4,3,7,4]] },
  { exhaustion: 70, cynicism: 68, efficacy: 65, total: 68, risk: 'medium',  checkins: [[4,3,4,7,3],[3,4,3,7,4],[2,3,3,8,3],[1,3,4,7,3]] },
  // high risk (2)
  { exhaustion: 78, cynicism: 75, efficacy: 72, total: 75, risk: 'high',    checkins: [[4,3,3,8,3],[3,3,3,8,3],[2,2,3,8,2],[1,3,2,8,3]] },
  { exhaustion: 82, cynicism: 80, efficacy: 78, total: 80, risk: 'high',    checkins: [[4,2,3,8,2],[3,2,2,9,3],[2,2,2,8,2],[1,2,2,9,2]] },
  // critical risk (1)
  { exhaustion: 95, cynicism: 92, efficacy: 90, total: 92, risk: 'critical',checkins: [[4,2,2,9,2],[3,2,2,9,2],[2,1,2,9,1],[1,2,1,9,2]] },
] as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { action } = await req.json() as { action: 'seed' | 'clean' };

    // Resolve the caller's org
    const { data: org } = await admin
      .from('organizations')
      .select('id')
      .eq('admin_user_id', user.id)
      .maybeSingle();

    if (!org) {
      return new Response(
        JSON.stringify({ error: 'NOT_ADMIN', message: "Aucune organisation trouvée pour cet admin." }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── CLEAN ────────────────────────────────────────────────────────────────
    if (action === 'clean') {
      // List ghost users in this org
      const { data: members } = await admin
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', org.id);

      const ghostIds: string[] = [];
      for (const m of members ?? []) {
        const { data: au } = await admin.auth.admin.getUserById(m.user_id);
        if (au?.user?.email?.endsWith(`@${GHOST_DOMAIN}`)) ghostIds.push(m.user_id);
      }

      // Delete test data, then ghost users
      for (const id of ghostIds) {
        await admin.from('checkins').delete().eq('user_id', id);
        await admin.from('assessments').delete().eq('user_id', id);
        await admin.from('organization_members').delete().eq('user_id', id).eq('organization_id', org.id);
        await admin.auth.admin.deleteUser(id);
      }

      return new Response(
        JSON.stringify({ ok: true, deleted: ghostIds.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── SEED ─────────────────────────────────────────────────────────────────
    if (action === 'seed') {
      const created: string[] = [];

      for (let i = 0; i < GHOST_COUNT; i++) {
        const profile = MEMBER_PROFILES[i];
        const email = `dev-ghost-${crypto.randomUUID().slice(0, 8)}@${GHOST_DOMAIN}`;

        // Create ghost auth user
        const { data: created_user, error: createErr } = await admin.auth.admin.createUser({
          email,
          password: crypto.randomUUID(),
          email_confirm: true,
        });
        if (createErr || !created_user.user) throw createErr ?? new Error('User creation failed');
        const uid = created_user.user.id;
        created.push(uid);

        // Add to org
        await admin.from('organization_members').insert({ organization_id: org.id, user_id: uid });

        // Assessment
        await admin.from('assessments').insert({
          user_id: uid,
          exhaustion_score: profile.exhaustion,
          cynicism_score: profile.cynicism,
          efficacy_score: profile.efficacy,
          total_score: profile.total,
          risk_level: profile.risk,
        });

        // 4 weekly check-ins
        const rows = profile.checkins.map(([back, energy, motivation, stress, balance]) => {
          const { week_number, year, created_at } = isoWeekForOffset(back);
          return { user_id: uid, week_number, year, energy, motivation, stress, work_life_balance: balance, created_at };
        });
        await admin.from('checkins').insert(rows);
      }

      return new Response(
        JSON.stringify({ ok: true, seeded: created.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
