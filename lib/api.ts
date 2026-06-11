import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { ActionPlan, RiskLevel } from '@/types/database';

// supabase-js returns `data: null` on a non-2xx response — the structured JSON
// body (e.g. { error: 'PREMIUM_REQUIRED', message: '...' }) is only readable via
// the FunctionsHttpError's `context` (the raw Response). Re-throw an Error whose
// `message` is the human-readable text and `status` is the real HTTP status, so
// callers can keep checking `err.status` / `err.message`.
async function throwFunctionError(error: unknown): Promise<never> {
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null);
    if (body?.error) {
      throw Object.assign(new Error(body.message ?? body.error), {
        status: error.context.status,
        code: body.error,
      });
    }
  }
  throw error;
}

export interface BurnoutResult {
  exhaustion_score: number;
  cynicism_score: number;
  efficacy_score: number;
  total_score: number;
  risk_level: RiskLevel;
  assessment_id: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiResponse {
  response: string;
  tokens_used: number;
}

export async function calculateBurnoutScore(answers: number[]): Promise<BurnoutResult> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.functions.invoke('calculate-burnout-score', {
    body: { answers, user_id: user?.id },
  });
  if (error) throw error;
  return data as BurnoutResult;
}

export async function generateActionPlan(assessmentId: string): Promise<ActionPlan> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.functions.invoke('generate-action-plan', {
    body: { assessment_id: assessmentId, user_id: user?.id },
  });
  if (error) await throwFunctionError(error);
  return data as ActionPlan;
}

export async function sendAiMessage(messages: Message[]): Promise<AiResponse> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.functions.invoke('ai-companion', {
    body: { messages, user_id: user?.id },
  });
  if (error) await throwFunctionError(error);
  return data as AiResponse;
}
