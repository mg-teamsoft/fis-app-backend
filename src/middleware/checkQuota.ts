// middlewares/checkQuota.ts
import { NextFunction, Request, Response } from 'express';
import { UserPlan, UserPlanModel } from '../models/UserPlanModel';
import { JwtUtil } from '../utils/jwtUtil';

type QuotaRequest = Request & {
  remainingQuota?: number;
  activePlans?: UserPlanModel[];
};

export const checkImageQuota = async (req: Request, res: Response, next: NextFunction) => {
  const quotaReq = req as QuotaRequest;
  const { userId } = await JwtUtil.extractUser(req);
  const now = new Date();
  console.debug('[checkImageQuota] start', { userId, at: now.toISOString() });

  // Get all active plans
  const plans = await UserPlan.find({
    userId,
    isActive: true,
    $or: [{ endDate: null }, { endDate: { $gte: now } }]
  });

  const totalRemaining = plans.reduce((acc, p) => acc + p.quota, 0);
  console.debug('[checkImageQuota] plans loaded', {
    userId,
    activePlanCount: plans.length,
    totalRemaining,
  });

  if (totalRemaining <= 0) {
    console.warn('[checkImageQuota] blocked - no quota left', { userId });
    return res.status(403).json({ error: 'Paket hakkınız kalmadı. Yeni bir plan satın alın.' });
  }

  quotaReq.remainingQuota = totalRemaining;
  quotaReq.activePlans = plans;
  console.debug('[checkImageQuota] pass', { userId, remainingQuota: totalRemaining });
  next();
};
