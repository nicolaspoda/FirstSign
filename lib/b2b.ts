import { supabase } from './supabase';
import { throwFunctionError } from './api';
import type { Organization } from '@/types/database';

export interface RiskDistribution {
  low: number;
  medium: number;
  high: number;
  critical: number;
}

export interface WeeklyEvolutionPoint {
  label: string;
  score: number;
}

export type TeamTrend = 'improving' | 'stable' | 'declining';

export interface B2BDashboard {
  organization_name: string;
  invite_code: string;
  member_count: number;
  average_score: number;
  risk_distribution: RiskDistribution;
  high_risk_count: number;
  critical_risk_count: number;
  team_trend: TeamTrend;
  weekly_evolution: WeeklyEvolutionPoint[];
}

export interface MembershipStatus {
  isMember: boolean;
  isAdmin: boolean;
}

export interface OrganizationInfo {
  organization: Organization;
  memberCount: number;
}

// Excludes visually ambiguous characters (0/O, 1/I/L) since invite codes are
// typed by hand.
const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INVITE_CODE_LENGTH = 8;
const MAX_CODE_ATTEMPTS = 5;

export function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += INVITE_CODE_CHARS[Math.floor(Math.random() * INVITE_CODE_CHARS.length)];
  }
  return code;
}

export async function createOrganization(name: string): Promise<Organization> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Vous devez être connecté.');

  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const { data, error } = await supabase
      .from('organizations')
      .insert({ name: name.trim(), code: generateInviteCode(), admin_user_id: user.id })
      .select()
      .single();

    if (!error) return data as Organization;
    if (error.code !== '23505') throw error; // not a unique violation on `code` — give up
    lastError = error;
  }
  throw lastError ?? new Error("Impossible de générer un code d'invitation unique.");
}

export async function joinOrganization(code: string): Promise<void> {
  const { error } = await supabase.rpc('join_organization_by_code', {
    p_code: code.trim().toUpperCase(),
  });
  if (error) throw new Error(error.message);
}

export async function getOrganizationDashboard(): Promise<B2BDashboard> {
  const { data, error } = await supabase.functions.invoke('b2b-dashboard');
  if (error) await throwFunctionError(error);
  return data as B2BDashboard;
}

export async function getMembershipStatus(): Promise<MembershipStatus> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { isMember: false, isAdmin: false };

  const [{ data: org }, { data: membership }] = await Promise.all([
    supabase.from('organizations').select('id').eq('admin_user_id', user.id).maybeSingle(),
    supabase.from('organization_members').select('id').eq('user_id', user.id).maybeSingle(),
  ]);

  return { isMember: !!membership || !!org, isAdmin: !!org };
}

export async function getMyOrganizationInfo(): Promise<OrganizationInfo | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: org, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('admin_user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (!org) return null;

  const { count, error: countError } = await supabase
    .from('organization_members')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', org.id);
  if (countError) throw countError;

  return { organization: org as Organization, memberCount: count ?? 0 };
}
