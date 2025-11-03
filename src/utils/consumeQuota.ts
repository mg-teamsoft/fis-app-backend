// utils/consumeQuota.ts
import { UserPlan } from '../models/UserPlanModel';

export const consumeQuota = async (userId: string) => {
  const plans = await UserPlan.find({
    userId,
    isActive: true,
    $or: [{ endDate: null }, { endDate: { $gte: new Date() } }],
  }).sort({ endDate: 1 }); // Use earliest expiring first

  for (let plan of plans) {
    if (plan.quota > 0) {
      plan.quota -= 1;
      await plan.save();
      return;
    }
  }

  throw new Error('Kullanıcının aktif hakkı bulunamadı.');
};