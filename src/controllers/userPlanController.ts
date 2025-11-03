import { Request, Response } from 'express';
import { UserPlan } from '../models/UserPlanModel';
import { Plan } from '../models/PlanModel';
import { JwtUtil } from '../utils/jwtUtil';

export async function listUserPlans(req: Request, res: Response) {
  try {
    const plans = await UserPlan.find().sort({ startDate: -1 }).lean();
    return res.json(plans);
  } catch (error: any) {
    return res.status(500).json({ message: 'Failed to list user plans.', error: error?.message });
  }
}

export async function getPlansForUser(req: Request, res: Response) {
  try {
    const { userId: userId } = await JwtUtil.extractUser(req);
    const plans = await UserPlan.find({ userId: userId }).sort({ startDate: -1 }).lean();
    return res.json(plans);
  } catch (error: any) {
    return res.status(500).json({ message: 'Failed to fetch user plans.', error: error?.message });
  }
}

export async function getUserPlan(req: Request, res: Response) {
  try {
    const plan = await UserPlan.findById(req.params.id).lean();
    if (!plan) {
      return res.status(404).json({ message: 'User plan not found.' });
    }
    return res.json(plan);
  } catch (error: any) {
    return res.status(500).json({ message: 'Failed to fetch user plan.', error: error?.message });
  }
}

export async function getUserPlanDetails(req: Request, res: Response) {
  try {
    const userPlan = await UserPlan.findById(req.params.id).lean();
    if (!userPlan) {
      return res.status(404).json({ message: 'User plan not found.' });
    }

    const planDetails = await Plan.findOne({ key: userPlan.planKey }).lean();

    return res.json({
      ...userPlan,
      planDetails,
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Failed to fetch user plan details.', error: error?.message });
  }
}
