import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Copenhagen Burnout Inventory (CBI) — 19 items, answers in {0,25,50,75,100}.
// Indices below match the display order produced by app/(onboarding)/assessment.tsx
// (and CBI_QUESTIONS in lib/burnout.ts): personal_1, work_1, relation_1,
// personal_2, work_2, relation_2, ... personal_6, work_6, work_7, relation_6.
const PERSONAL_INDICES = [0, 3, 6, 9, 12, 15];
const WORK_INDICES     = [1, 4, 7, 10, 13, 16, 17];
const RELATION_INDICES = [2, 5, 8, 11, 14, 18];

// work_7 ("énergie pour la famille et les amis") is reversed: a high raw
// answer means LESS burnout, so it must be inverted before averaging.
const REVERSED_INDICES = new Set([17]);

const TOTAL_QUESTIONS = 19;

// CBI risk thresholds, applied to the 0–100 global score
const RISK_MEDIUM = 50;
const RISK_HIGH = 75;
const RISK_CRITICAL = 90;

function dimensionAverage(answers: number[], indices: number[]): number {
  const sum = indices.reduce((acc, i) => {
    const raw = answers[i] ?? 0;
    return acc + (REVERSED_INDICES.has(i) ? 100 - raw : raw);
  }, 0);
  return sum / indices.length;
}

function getRiskLevel(totalScore: number): string {
  if (totalScore >= RISK_CRITICAL) return 'critical';
  if (totalScore >= RISK_HIGH) return 'high';
  if (totalScore >= RISK_MEDIUM) return 'medium';
  return 'low';
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

    const { answers } = await req.json();

    if (!Array.isArray(answers) || answers.length !== TOTAL_QUESTIONS) {
      return new Response(
        JSON.stringify({ error: `${TOTAL_QUESTIONS} réponses CBI requises (scores 0/25/50/75/100).` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Score per dimension = moyenne des réponses (0–100)
    const personal_score = dimensionAverage(answers, PERSONAL_INDICES);
    const work_score = dimensionAverage(answers, WORK_INDICES);
    const relations_score = dimensionAverage(answers, RELATION_INDICES);

    const total_score = (personal_score + work_score + relations_score) / 3;
    const risk_level = getRiskLevel(total_score);

    // DB columns keep their original names from the previous questionnaire:
    //   exhaustion_score → personal, cynicism_score → work, efficacy_score → relations
    const exhaustion_score = Math.round(personal_score);
    const cynicism_score = Math.round(work_score);
    const efficacy_score = Math.round(relations_score);
    const total_score_rounded = Math.round(total_score);

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data, error } = await adminClient
      .from('assessments')
      .insert({
        user_id,
        exhaustion_score,
        cynicism_score,
        efficacy_score,
        total_score: total_score_rounded,
        risk_level,
      })
      .select()
      .single();

    if (error) throw error;

    return new Response(
      JSON.stringify({
        exhaustion_score,
        cynicism_score,
        efficacy_score,
        total_score: total_score_rounded,
        risk_level,
        assessment_id: data.id,
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
