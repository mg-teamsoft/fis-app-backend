import { Request, Response } from 'express';
import { Plan } from '../models/PlanModel';
import { UserPlan } from '../models/UserPlanModel';

type PurchasePlanOptions = {
  userPlanId?: string;
};

export async function createPlan(req: Request, res: Response) {
  try {
    const { key, name, explanation, quota, period, price, currency } = req.body;

    const plan = await Plan.create({
      key,
      name,
      explanation,
      quota,
      period,
      price,
      currency,
    });

    res.locals.auditPayload = { planId: plan.id, planKey: plan.key };
    res.locals.auditMessage = 'Plan created';

    return res.status(201).json(plan);
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Plan already exists with this key.' });
    }

    if (error?.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }

    return res.status(500).json({ message: 'Failed to create plan.' });
  }
}

export async function listPlans(req: Request, res: Response) {
  try {
    const plans = await Plan.find().sort({ name: 1 });
    return res.json(plans);
  } catch {
    return res.status(500).json({ message: 'Failed to list plans.' });
  }
}

export async function getPlanById(req: Request, res: Response) {
  try {
    const plan = await Plan.findById(req.params.id);
    if (!plan) {
      return res.status(404).json({ message: 'Plan not found.' });
    }
    return res.json(plan);
  } catch {
    return res.status(500).json({ message: 'Failed to fetch plan.' });
  }
}

export async function updatePlan(req: Request, res: Response) {
  try {
    const updatableFields: Array<'key' | 'name' | 'explanation' | 'quota' | 'period' | 'price' | 'currency'> = [
      'key',
      'name',
      'explanation',
      'quota',
      'period',
      'price',
      'currency',
    ];
    const updates: Record<string, unknown> = {};

    updatableFields.forEach((field) => {
      if (typeof req.body[field] !== 'undefined') {
        updates[field] = req.body[field];
      }
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No fields provided for update.' });
    }

    const plan = await Plan.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true },
    );

    if (!plan) {
      return res.status(404).json({ message: 'Plan not found.' });
    }

    res.locals.auditPayload = { planId: plan.id, planKey: plan.key };
    res.locals.auditMessage = 'Plan updated';

    return res.json(plan);
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Plan already exists with this key.' });
    }

    if (error?.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }

    return res.status(500).json({ message: 'Failed to update plan.' });
  }
}

export async function deletePlan(req: Request, res: Response) {
  try {
    const plan = await Plan.findByIdAndDelete(req.params.id);

    if (!plan) {
      return res.status(404).json({ message: 'Plan not found.' });
    }

    res.locals.auditPayload = { planId: plan.id, planKey: plan.key };
    res.locals.auditMessage = 'Plan deleted';

    return res.status(200).json({ message: 'Plan deleted successfully.' });
  } catch {
    return res.status(500).json({ message: 'Failed to delete plan.' });
  }
}

export async function purchasePlan(userId: string, planKey: string, options: PurchasePlanOptions = {}) {
  const plan = await Plan.findOne({ key: planKey });
  if (!plan) throw new Error('Plan bulunamadı');

  const now = new Date();
  const endDate = calculateEndDate(plan.key, plan.period, now);

  const payload = {
    userId,
    planKey,
    quota: plan.quota,
    period: plan.period,
    startDate: now,
    endDate,
    isActive: true,
  };

  if (options.userPlanId) {
    const updatedPlan = await UserPlan.findOneAndUpdate(
      { _id: options.userPlanId, userId },
      payload,
      { new: true, runValidators: true },
    );

    if (!updatedPlan) {
      throw new Error('Güncellenecek kullanıcı planı bulunamadı');
    }

    return updatedPlan;
  }

  return UserPlan.create(payload);
}

function calculateEndDate(planKey: string, period: string, from: Date) {
  if (planKey === 'ADDITIONAL') {
    return null;
  }

  if (period === 'monthly') {
    return new Date(from.getFullYear(), from.getMonth() + 1, from.getDate());
  }

  if (period === 'yearly') {
    return new Date(from.getFullYear() + 1, from.getMonth(), from.getDate());
  }

  return null;
}
