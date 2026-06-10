import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// MBI item numbers (1-based), matching standard MBI-HSS subscales
const EXHAUSTION_ITEMS = [1, 2, 3, 6, 8, 13, 14, 16, 20]; // 9 items × max 6 = max 54
const CYNICISM_ITEMS   = [5, 10, 11, 15, 22];              // 5 items × max 6 = max 30
const EFFICACY_ITEMS   = [4, 7, 9, 12, 17, 18, 19, 21];   // 8 items × max 6 = max 48

const EE_MAX = 54;
const DP_MAX = 30;
const PA_MAX = 48;

// Standard Maslach cutoffs (sum-based, not averages)
const EE_MOD = 17; const EE_HIGH = 27;
const DP_MOD = 7;  const DP_HIGH = 13;
const PA_LOW = 31; const PA_MOD  = 38;

function sumItems(answers: number[], items: number[]): number {
  return items.reduce((sum, i) => sum + (answers[i - 1] ?? 0), 0);
}

function getRiskLevel(exhaustion: number, cynicism: number, efficacy: number): string {
  const eeHigh = exhaustion >= EE_HIGH;
  const eeMod  = exhaustion >= EE_MOD;
  const dpHigh = cynicism   >= DP_HIGH;
  const dpMod  = cynicism   >= DP_MOD;
  const paLow  = efficacy   <= PA_LOW;
  const paMod  = efficacy   <= PA_MOD;

  if (eeHigh && (dpHigh || paLow)) return 'critical';
  if (eeHigh || (dpHigh && paLow)) return 'high';
  if (eeMod  || dpMod  || paMod)  return 'medium';
  return 'low';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { answers, user_id } = await req.json();

    if (!Array.isArray(answers) || answers.length !== 22) {
      return new Response(
        JSON.stringify({ error: '22 réponses MBI requises (scores 0-6).' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Sum scores per dimension (standard MBI scoring)
    const exhaustion_score = sumItems(answers, EXHAUSTION_ITEMS); // 0–54
    const cynicism_score   = sumItems(answers, CYNICISM_ITEMS);   // 0–30
    const efficacy_score   = sumItems(answers, EFFICACY_ITEMS);   // 0–48

    // Normalize each dimension to 0–100 (higher = more burnout risk)
    // Efficacy is inverted: low efficacy = high burnout
    const eeNorm  = (exhaustion_score / EE_MAX) * 100;
    const dpNorm  = (cynicism_score   / DP_MAX) * 100;
    const paInv   = ((PA_MAX - efficacy_score) / PA_MAX) * 100;

    // Composite burnout score 0–99 (capped to fit numeric(4,2) column)
    const total_score = Math.min(99, Math.round((eeNorm + dpNorm + paInv) / 3));

    const risk_level = getRiskLevel(exhaustion_score, cynicism_score, efficacy_score);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data, error } = await supabase
      .from('assessments')
      .insert({ user_id, exhaustion_score, cynicism_score, efficacy_score, total_score, risk_level })
      .select()
      .single();

    if (error) throw error;

    return new Response(
      JSON.stringify({
        exhaustion_score,
        cynicism_score,
        efficacy_score,
        total_score,
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
