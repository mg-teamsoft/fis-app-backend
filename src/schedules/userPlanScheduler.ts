import dayjs from 'dayjs';
import { UserPlan } from '../models/UserPlanModel';
import { Plan } from '../models/PlanModel';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PLAN_DATA = {
  FREE: { quota: 5, period: 'monthly' as const },
  MONTHLY: { quota: 100, period: 'monthly' as const },
  YEARLY: { quota: 1000, period: 'yearly' as const },
};

async function resetExpiredUserPlans() {
  const now = new Date();

  const [templatePlans, userPlans] = await Promise.all([
    Plan.find({ key: { $in: ['FREE', 'MONTHLY', 'YEARLY'] } }).lean(),
    UserPlan.find(),
  ]);

  const templates = new Map(templatePlans.map((plan) => [plan.key, plan]));
  let resetCount = 0;

  await Promise.all(
    userPlans.map(async (userPlan) => {
      if (!userPlan.endDate || userPlan.endDate > now) {
        return;
      }

      const key = userPlan.planKey;
      const updates: Record<string, any> = {
        isActive: true,
        startDate: now,
      };

      if (key === 'ADDITIONAL') {
        const freeTemplate = templates.get('FREE') ?? DEFAULT_PLAN_DATA.FREE;

        updates.planKey = 'FREE';
        updates.period = freeTemplate.period;
        updates.quota = freeTemplate.quota;
        updates.endDate = getNextEndDate(freeTemplate.period, now);
      } else {
        const template =
          templates.get(key as 'FREE' | 'MONTHLY' | 'YEARLY') ??
          DEFAULT_PLAN_DATA[key as 'FREE' | 'MONTHLY' | 'YEARLY'];

        updates.quota = template.quota;
        updates.period = template.period;
        updates.endDate = getNextEndDate(template.period, now);
      }

      userPlan.set(updates);
      await userPlan.save();
      resetCount += 1;
    }),
  );

  if (resetCount > 0) {
    console.log(`[UserPlanScheduler] Reset quotas for ${resetCount} user plans at ${new Date().toISOString()}`);
  }
}

function getNextEndDate(period: string, from: Date) {
  const base = dayjs(from);
  switch (period) {
    case 'monthly':
      return base.add(1, 'month').toDate();
    case 'yearly':
      return base.add(1, 'year').toDate();
    default:
      return null;
  }
}

export function scheduleUserPlanMaintenance() {
  scheduleNextRun();
}

function scheduleNextRun() {
  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setHours(1, 0, 0, 0);

  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  const delay = nextRun.getTime() - now.getTime();
  console.log(
    `[UserPlanScheduler] Next quota reset scheduled at ${nextRun.toISOString()} (${Math.round(delay / 1000)}s)`,
  );
  setTimeout(async () => {
    try {
      await resetExpiredUserPlans();
    } catch (error) {
      console.error('[UserPlanScheduler] Failed to reset user plans:', error);
    } finally {
      setInterval(async () => {
        try {
          await resetExpiredUserPlans();
        } catch (error) {
          console.error('[UserPlanScheduler] Failed to reset user plans:', error);
        }
      }, ONE_DAY_MS);
    }
  }, delay);
}

export async function manualUserPlanReset() {
  await resetExpiredUserPlans();
}
