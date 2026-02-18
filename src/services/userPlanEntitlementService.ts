// Pseudocode: adapt to your existing UserPlan model/service
// You likely already have something like UserPlanService or UserPlanModel.

import { PlanKey, PlanPeriod } from "../models/PlanModel";
import { UserPlan, UserPlanModel } from "../models/UserPlanModel";
import { PlanUtil } from "../utils/planUtil";

function startOfNextMonthUtc(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0));
}

function startOfNextYearUtc(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear() + 1, 0, 1, 0, 0, 0));
}

function mapUserPlanToEntitlement(userPlan: UserPlanModel | null) {
  if (!userPlan) {
    return { planKey: PlanKey.FREE, remainingQuota: 0, quotaResetAt: null, expiresAt: null };
  }

  return {
    planKey: userPlan.planKey,
    remainingQuota: userPlan.quota,
    quotaResetAt: userPlan.endDate ?? null,
    expiresAt: userPlan.endDate ?? null,
  };
}

export async function applySubscriptionEntitlement(args: {
  userId: string;
  planKey: PlanKey.MONTHLY_100 | PlanKey.YEARLY_1200;
  period: PlanPeriod;
  planQuota: number;
  expiresAt?: Date;
  purchaseDate?: Date;
}) {
  const { userId, planKey, planQuota, period, expiresAt, purchaseDate } = args;

  const startDate = purchaseDate ?? new Date();
  const endDate = expiresAt ?? PlanUtil.getNextEndDate({ planKey, period, from: startDate });

  const up = await UserPlan.findOneAndUpdate(
    { userId },
    {
      $set: {
        planKey,
        quota: planQuota,
        period,
        startDate,
        endDate,
        isActive: true,
      },
    },
    { upsert: true, new: true, runValidators: true }
  ).lean();

  return mapUserPlanToEntitlement(up);
}

export async function applyConsumableEntitlement(args: {
  userId: string;
  addQuota: number;
  planKey: PlanKey;
  period?: PlanPeriod;
}) {
  const { userId, addQuota, planKey, period } = args;
  const now = new Date();

  const up = await UserPlan.findOneAndUpdate(
    { userId },
    {
      $inc: { quota: addQuota },
      $setOnInsert: {
        planKey,
        period: period ?? PlanPeriod.ONCE,
        startDate: now,
        endDate: null,
        isActive: true,
      },
    },
    { upsert: true, new: true, runValidators: true }
  ).lean();

  return mapUserPlanToEntitlement(up);
}

export async function getUserEntitlementSnapshot(userId: string) {
  const up = await UserPlan.findOne({ userId }).lean();
  return mapUserPlanToEntitlement(up);
}
