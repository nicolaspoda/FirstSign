import { supabase } from './supabase';
import type { Checkin } from '@/types/database';

export type Trend = 'improving' | 'stable' | 'declining';

export interface CheckinInput {
  userId: string;
  energy: number;           // 1–10
  motivation: number;       // 1–10
  stress: number;           // 1–10 (higher = more stressed)
  work_life_balance: number; // 1–10
  notes?: string;
}

// ISO 8601 week number — year can differ from calendar year near Jan 1
function getISOWeek(date: Date): { week_number: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week_number = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week_number, year: d.getUTCFullYear() };
}

// Composite wellbeing score 1–10 (higher = better)
export function wellbeingScore(checkin: Checkin): number {
  const values: number[] = [];
  if (checkin.energy != null)            values.push(checkin.energy);
  if (checkin.motivation != null)        values.push(checkin.motivation);
  if (checkin.stress != null)            values.push(11 - checkin.stress); // invert
  if (checkin.work_life_balance != null) values.push(checkin.work_life_balance);
  if (values.length === 0) return 5;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// Upserts one check-in per (user, week, year) — requires a unique constraint on those 3 columns
export async function saveWeeklyCheckin(input: CheckinInput): Promise<Checkin> {
  const { week_number, year } = getISOWeek(new Date());

  const { data, error } = await supabase
    .from('checkins')
    .upsert(
      {
        user_id: input.userId,
        week_number,
        year,
        energy: input.energy,
        motivation: input.motivation,
        stress: input.stress,
        work_life_balance: input.work_life_balance,
        notes: input.notes ?? null,
      },
      { onConflict: 'user_id,week_number,year' },
    )
    .select()
    .single();

  if (error) throw error;
  return data as Checkin;
}

export async function getCheckinHistory(userId: string, weeks: number): Promise<Checkin[]> {
  const { data, error } = await supabase
    .from('checkins')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(weeks);

  if (error) throw error;
  return (data ?? []) as Checkin[];
}

// Compares average wellbeing of the older half vs the recent half
export function detectTrend(checkins: Checkin[]): Trend {
  if (checkins.length < 4) return 'stable';

  const sorted = [...checkins].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const mid = Math.floor(sorted.length / 2);
  const avgOlder  = sorted.slice(0, mid).reduce((s, c) => s + wellbeingScore(c), 0) / mid;
  const recentHalf = sorted.slice(mid);
  const avgRecent = recentHalf.reduce((s, c) => s + wellbeingScore(c), 0) / recentHalf.length;

  const delta = avgRecent - avgOlder;
  if (delta > 0.5)  return 'improving';
  if (delta < -0.5) return 'declining';
  return 'stable';
}

// Returns true when wellbeing has dropped consistently and significantly over the last 3 check-ins
export function shouldAlert(checkins: Checkin[]): boolean {
  if (checkins.length < 3) return false;

  const sorted = [...checkins].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const last3 = sorted.slice(-3).map(wellbeingScore);
  const isMonotonicallyDecreasing = last3[0] > last3[1] && last3[1] > last3[2];
  const totalDrop = last3[0] - last3[2];

  return isMonotonicallyDecreasing && totalDrop >= 2;
}
