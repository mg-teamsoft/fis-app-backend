import dayjs from 'dayjs';
import { Plan, PlanKey, PlanPeriod } from '../models/PlanModel';

type NextEndDateArgs = {
  planKey?: string;
  period: string;
  from: Date;
};

function getNextEndDate({ planKey, period, from }: NextEndDateArgs) {
  if (planKey === PlanKey.ADDITIONAL_100) {
    return null;
  }

  const base = dayjs(from);
  switch (period) {
    case PlanPeriod.MONTHLY:
      return base.add(1, 'month').toDate();
    case PlanPeriod.YEARLY:
      return base.add(1, 'year').toDate();
    default:
      return null;
  }
}

export const PlanUtil = {
  getNextEndDate,
};
