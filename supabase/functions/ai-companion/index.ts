import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BASE_SYSTEM_PROMPT =
  "Tu es un compagnon bienveillant spécialisé dans la prévention du burnout. Tu écoutes avec empathie, poses des questions ouvertes, et proposes des stratégies concrètes basées sur les thérapies cognitivo-comportementales. Tu réponds toujours en français, avec douceur et bienveillance.";

const RISK_LABELS: Record<string, string> = {
  low: 'faible',
  medium: 'modéré',
  high: 'élevé',
  critical: 'critique',
};

const REMOTE_WORK_LABELS: Record<string, string> = {
  yes: 'Full remote',
  no: 'En présentiel',
  hybrid: 'Hybride',
};

const FREE_MONTHLY_LIMIT = 3;
const GEMINI_MODEL = 'gemini-2.5-flash';

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

    const { messages } = await req.json();

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check subscription tier
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('subscription_tier, sector, remote_work, is_manager, main_stress_source')
      .eq('user_id', user_id)
      .single();
    if (profileError) throw profileError;

    const isPremium = profile?.subscription_tier === 'premium';

    if (!isPremium) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { count } = await adminClient
        .from('ai_conversations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user_id)
        .gte('created_at', startOfMonth.toISOString());

      if ((count ?? 0) >= FREE_MONTHLY_LIMIT) {
        return new Response(
          JSON.stringify({
            error: 'LIMIT_REACHED',
            message: 'Vous avez atteint votre limite de 3 conversations ce mois-ci. Passez premium pour continuer.',
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Fetch latest assessment and last 12 check-ins
    const { data: assessment } = await adminClient
      .from('assessments')
      .select('exhaustion_score, cynicism_score, efficacy_score, risk_level')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: recentCheckins } = await adminClient
      .from('checkins')
      .select('week_number, year, energy, motivation, stress, work_life_balance, created_at')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(12);

    const assessmentContext = assessment
      ? `\n\nCONTEXTE UTILISATEUR : L'utilisateur a un score d'épuisement personnel de ${assessment.exhaustion_score}/100, un épuisement professionnel de ${assessment.cynicism_score}/100 et un épuisement relationnel de ${assessment.efficacy_score}/100 (questionnaire CBI). Son niveau de risque de burnout est ${RISK_LABELS[assessment.risk_level] ?? assessment.risk_level}. Adapte tes conseils à ce profil spécifique et fais référence à ces dimensions lorsque c'est pertinent.`
      : '';

    const profileLines: string[] = [];
    if (profile?.sector) profileLines.push(`- Secteur : ${profile.sector}`);
    if (profile?.remote_work) profileLines.push(`- Télétravail : ${REMOTE_WORK_LABELS[profile.remote_work] ?? profile.remote_work}`);
    if (profile?.is_manager !== null && profile?.is_manager !== undefined) {
      profileLines.push(`- Manager : ${profile.is_manager ? 'Oui' : 'Non'}`);
    }
    if (profile?.main_stress_source) profileLines.push(`- Principale source de stress : ${profile.main_stress_source}`);

    const userContextBlock = profileLines.length > 0
      ? `\n\nCONTEXTE UTILISATEUR :\n${profileLines.join('\n')}\n\nUtilise ces informations pour personnaliser tes réponses (ex. mentionner le secteur, adapter les conseils au télétravail ou au rôle de manager, prioriser la source de stress principale).`
      : '';

    let checkinsBlock = '';

    if (recentCheckins && recentCheckins.length > 0) {
      const historyLines = recentCheckins
        .map((c) => `Semaine ${c.week_number} (${c.year}) - Énergie: ${c.energy}/10, Motivation: ${c.motivation}/10, Stress: ${c.stress}/10, Équilibre: ${c.work_life_balance}/10`)
        .join('\n');

      const last4 = recentCheckins.slice(0, Math.min(4, recentCheckins.length));

      // Trends are computed over the last 4 check-ins (index 0 = most recent)
      const calcTrend = (values: number[], lowerIsBetter = false): string => {
        if (values.length < 2) return 'insuffisant de données';
        const diff = values[0] - values[values.length - 1];
        if (Math.abs(diff) <= 0.5) return 'stable';
        const increasing = diff > 0;
        return lowerIsBetter
          ? (increasing ? 'en hausse (dégradation)' : 'en baisse (amélioration)')
          : (increasing ? 'en hausse' : 'en baisse');
      };

      const energyTrend = calcTrend(last4.map((c) => c.energy));
      const stressTrend = calcTrend(last4.map((c) => c.stress), true);
      const motivationTrend = calcTrend(last4.map((c) => c.motivation));

      // wellbeing = (energy + motivation + (10 - stress) + work_life_balance) / 4
      // recentCheckins is ordered desc, so index i+1 is the week before index i
      const wellbeingScores = recentCheckins.map(
        (c) => (c.energy + c.motivation + (10 - c.stress) + c.work_life_balance) / 4
      );
      let consecutiveDegradation = 0;
      for (let i = 0; i < wellbeingScores.length - 1; i++) {
        if (wellbeingScores[i] < wellbeingScores[i + 1]) {
          consecutiveDegradation++;
        } else {
          break;
        }
      }

      checkinsBlock = `\n\nHISTORIQUE DES 12 DERNIÈRES SEMAINES :\n${historyLines}\n\nANALYSE DES TENDANCES :\n- Tendance énergie : ${energyTrend}\n- Tendance stress : ${stressTrend}\n- Tendance motivation : ${motivationTrend}\n- Semaines consécutives en dégradation : ${consecutiveDegradation}\n\nUtilise ces données pour personnaliser tes réponses. Par exemple :\n- Si l'énergie baisse depuis 3+ semaines : mentionne-le proactivement\n- Si le stress augmente régulièrement : propose des actions concrètes\n- Si amélioration notable : encourage et renforce les comportements positifs`;
    }

    const systemPrompt = `${BASE_SYSTEM_PROMPT}${assessmentContext}${userContextBlock}${checkinsBlock}`;

    const contents = messages.map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${Deno.env.get('GEMINI_API_KEY')}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 1024 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errBody = await geminiRes.json().catch(() => ({}));
      const isTransient =
        geminiRes.status === 429 ||
        geminiRes.status === 503 ||
        errBody?.error?.status === 'RESOURCE_EXHAUSTED' ||
        errBody?.error?.status === 'UNAVAILABLE';
      if (isTransient) {
        return new Response(
          JSON.stringify({ error: 'SERVICE_UNAVAILABLE', message: 'Le service IA est temporairement indisponible. Réessayez dans quelques instants.' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Gemini API error: ${JSON.stringify(errBody)}`);
    }

    const geminiData = await geminiRes.json();
    const responseText: string =
      geminiData.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ||
      "Je suis désolé, je n'ai pas pu formuler de réponse. Pouvez-vous reformuler votre message ?";
    const tokens_used = geminiData.usageMetadata?.totalTokenCount ?? 0;

    const allMessages = [...messages, { role: 'assistant', content: responseText }];

    await adminClient
      .from('ai_conversations')
      .insert({ user_id, messages: allMessages, tokens_used });

    return new Response(
      JSON.stringify({ response: responseText, tokens_used }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
