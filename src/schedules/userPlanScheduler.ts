import { UserPlan } from '../models/UserPlanModel';
import { Plan, PlanKey, PlanPeriod } from '../models/PlanModel';
import { PlanUtil } from '../utils/planUtil';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PLAN_DATA = {
  [PlanKey.FREE]: { quota: 5, period: PlanPeriod.MONTHLY as const },
  [PlanKey.MONTHLY_100]: { quota: 100, period: PlanPeriod.MONTHLY  as const },
  [PlanKey.YEARLY_1000]: { quota: 1000, period: PlanPeriod.YEARLY as const },
};

async function resetExpiredUserPlans() {
  const now = new Date();

  const [templatePlans, userPlans] = await Promise.all([
    Plan.find({ key: { $in: [PlanKey.FREE, PlanKey.MONTHLY_100, PlanKey.YEARLY_1000] } }).lean(),
    UserPlan.find(),
  ]);

  const templates = new Map(templatePlans.map((plan) => [plan.key, plan]));
  let resetCount = 0;

  await Promise.all(
    userPlans.map(async (userPlan) => {
      const isExpired = !!userPlan.endDate && userPlan.endDate <= now;
      const isAdditionalDepleted = userPlan.planKey === PlanKey.ADDITIONAL_100 && userPlan.quota <= 0;

      if (!isExpired && !isAdditionalDepleted) {
        return;
      }

      const key = userPlan.planKey;
      const updates: Record<string, any> = {
        isActive: true,
        startDate: now,
      };

      if (key === PlanKey.ADDITIONAL_100) {
        if (!isAdditionalDepleted && !isExpired) {
          return;
        }
        const freeTemplate = templates.get(PlanKey.FREE);
        const freePlan = freeTemplate ?? DEFAULT_PLAN_DATA[PlanKey.FREE];

        updates.planKey = PlanKey.FREE;
        updates.period = freePlan.period;
        updates.quota = freePlan.quota;
        updates.endDate = PlanUtil.getNextEndDate({ period: freePlan.period, from: now });
      } else {
        const planKey = key as PlanKey;
        const template = templates.get(planKey);
        const templatePlan =
          template ?? DEFAULT_PLAN_DATA[planKey as Exclude<PlanKey, typeof PlanKey.ADDITIONAL_100>];

        if (template?.isActive === false) {
          const freeTemplate = templates.get(PlanKey.FREE);
          const freePlan = freeTemplate ?? DEFAULT_PLAN_DATA[PlanKey.FREE];

          updates.planKey = PlanKey.FREE;
          updates.period = freePlan.period;
          updates.quota = freePlan.quota;
          updates.endDate = PlanUtil.getNextEndDate({ period: freePlan.period, from: now });
        } else {
          updates.quota = templatePlan.quota;
          updates.period = templatePlan.period;
          updates.endDate = PlanUtil.getNextEndDate({ period: templatePlan.period, from: now });
        }
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
