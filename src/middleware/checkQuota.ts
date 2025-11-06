// middlewares/checkQuota.ts
import { NextFunction, Request, Response } from 'express';
import { UserPlan } from '../models/UserPlanModel';
import { JwtUtil } from '../utils/jwtUtil';

export const checkImageQuota = async (req: Request, res: Response, next: NextFunction) => {
const { userId } = await JwtUtil.extractUser(req);
  const now = new Date();

  // Get all active plans
  const plans = await UserPlan.find({
    userId,
    isActive: true,
    $or: [{ endDate: null }, { endDate: { $gte: now } }]
  });

  const totalRemaining = plans.reduce((acc, p) => acc + p.quota, 0);

  if (totalRemaining <= 0) {
    return res.status(403).json({ error: 'Paket hakkınız kalmadı. Yeni bir plan satın alın.' });
  }

  req.remainingQuota = totalRemaining;
  req.activePlans = plans;
  next();
};