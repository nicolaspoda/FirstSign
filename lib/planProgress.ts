import type { ActionPlan, Checkin } from '@/types/database';

export const PLAN_TOTAL_WEEKS = 8;
export const ACTIONS_PER_WEEK = 3;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface WeekProgress {
  week: number;
  completed: number;
  total: number;
  allActionsDone: boolean;
  hasCheckin: boolean;
  fullyDone: boolean;
}

export interface PlanProgress {
  totalActions: number;
  completedActions: number;
  completionRate: number;
  currentWeek: number;
  weeksRemaining: number;
  isComplete: boolean;
  currentStreak: number;
  bestStreak: number;
  currentWeekCompleted: number;
  currentWeekTotal: number;
}

export function getCurrentPlanWeek(createdAt: string): number {
  const start = new Date(createdAt);
  const now = new Date();
  const diffWeeks = Math.floor((now.getTime() - start.getTime()) / WEEK_MS);
  return Math.min(Math.max(1, diffWeeks + 1), PLAN_TOTAL_WEEKS);
}

// A week counts towards a streak when every action for that week is completed
// and the user logged a check-in during that week's date range.
function getWeekStatuses(
  plan: ActionPlan,
  completedIds: Set<string>,
  checkins: Checkin[],
  currentWeek: number,
): WeekProgress[] {
  const actions = plan.actions ?? [];
  const createdAt = new Date(plan.created_at).getTime();

  const statuses: WeekProgress[] = [];
  for (let week = 1; week <= Math.min(currentWeek, PLAN_TOTAL_WEEKS); week++) {
    const weekActions = actions.filter((a) => a.week === week);
    const completed = weekActions.filter((a) => completedIds.has(a.id)).length;
    const allActionsDone = weekActions.length > 0 && completed === weekActions.length;

    const weekStart = createdAt + (week - 1) * WEEK_MS;
    const weekEnd = createdAt + week * WEEK_MS;
    const hasCheckin = checkins.some((c) => {
      const t = new Date(c.created_at).getTime();
      return t >= weekStart && t < weekEnd;
    });

    statuses.push({
      week,
      completed,
      total: weekActions.length,
      allActionsDone,
      hasCheckin,
      fullyDone: allActionsDone && hasCheckin,
    });
  }
  return statuses;
}

export function computePlanProgress(
  plan: ActionPlan,
  completedIds: Set<string>,
  checkins: Checkin[],
): PlanProgress {
  const actions = plan.actions ?? [];

  const totalActions = actions.length;
  const completedActions = actions.filter((a) => completedIds.has(a.id)).length;
  const completionRate = totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 0;
  const isComplete = totalActions > 0 && completedActions === totalActions;

  const currentWeek = getCurrentPlanWeek(plan.created_at);
  const weeksRemaining = Math.max(0, PLAN_TOTAL_WEEKS - currentWeek);

  const weekStatuses = getWeekStatuses(plan, completedIds, checkins, currentWeek);

  // The current week is still in progress — if it isn't done yet, that
  // shouldn't break a streak built on prior, fully-elapsed weeks.
  let streakEnd = weekStatuses.length - 1;
  if (streakEnd >= 0 && !weekStatuses[streakEnd].fullyDone && weekStatuses[streakEnd].week === currentWeek) {
    streakEnd--;
  }

  let currentStreak = 0;
  for (let i = streakEnd; i >= 0; i--) {
    if (!weekStatuses[i].fullyDone) break;
    currentStreak++;
  }

  let bestStreak = 0;
  let run = 0;
  for (const status of weekStatuses) {
    run = status.fullyDone ? run + 1 : 0;
    bestStreak = Math.max(bestStreak, run);
  }

  const currentWeekStatus = weekStatuses[weekStatuses.length - 1];

  return {
    totalActions,
    completedActions,
    completionRate,
    currentWeek,
    weeksRemaining,
    isComplete,
    currentStreak,
    bestStreak,
    currentWeekCompleted: currentWeekStatus?.completed ?? 0,
    currentWeekTotal: currentWeekStatus?.total ?? ACTIONS_PER_WEEK,
  };
}
