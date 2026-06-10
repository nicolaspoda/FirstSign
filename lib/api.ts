import { supabase } from './supabase';
import type { ActionPlan, RiskLevel } from '@/types/database';

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
  if (error) throw error;
  return data as ActionPlan;
}

export async function sendAiMessage(messages: Message[]): Promise<AiResponse> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.functions.invoke('ai-companion', {
    body: { messages, user_id: user?.id },
  });
  if (error) throw error;
  return data as AiResponse;
}
