// utils/consumeQuota.ts
import { UserPlan } from '../models/UserPlanModel';

export const consumeQuota = async (userId: string) => {
  const now = new Date();
  console.debug('[consumeQuota] start', { userId, at: now.toISOString() });

  // Atomic decrement: only update a single eligible plan with quota > 0.
  const updatedPlan = await UserPlan.findOneAndUpdate(
    {
      userId,
      isActive: true,
      quota: { $gt: 0 },
      $or: [{ endDate: null }, { endDate: { $gte: now } }],
    },
    { $inc: { quota: -1 } },
    {
      sort: { endDate: 1 }, // Keep existing "earliest expiry first" behavior
      new: true,
    }
  );

  if (!updatedPlan) {
    console.warn('[consumeQuota] failed - no eligible active plan', { userId });
    throw new Error('Kullanıcının aktif hakkı bulunamadı.');
  }

  console.debug('[consumeQuota] success', {
    userId,
    planId: updatedPlan._id?.toString(),
    planKey: updatedPlan.planKey,
    remainingPlanQuota: updatedPlan.quota,
  });
};
