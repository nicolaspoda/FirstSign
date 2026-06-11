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

const FREE_MONTHLY_LIMIT = 3;
const GEMINI_MODEL = 'gemini-2.5-flash';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { messages, user_id } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check subscription tier
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier')
      .eq('user_id', user_id)
      .single();

    const isPremium = profile?.subscription_tier === 'premium';

    if (!isPremium) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { count } = await supabase
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

    // Fetch user's latest assessment for personalized system prompt
    const { data: assessment } = await supabase
      .from('assessments')
      .select('exhaustion_score, cynicism_score, efficacy_score, risk_level')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const systemPrompt = assessment
      ? `${BASE_SYSTEM_PROMPT}\n\nCONTEXTE UTILISATEUR : L'utilisateur a un score d'épuisement personnel de ${assessment.exhaustion_score}/100, un épuisement professionnel de ${assessment.cynicism_score}/100 et un épuisement relationnel de ${assessment.efficacy_score}/100 (questionnaire CBI). Son niveau de risque de burnout est ${RISK_LABELS[assessment.risk_level] ?? assessment.risk_level}. Adapte tes conseils à ce profil spécifique et fais référence à ces dimensions lorsque c'est pertinent.`
      : BASE_SYSTEM_PROMPT;

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

    await supabase
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
