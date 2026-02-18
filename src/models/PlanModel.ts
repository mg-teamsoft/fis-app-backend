// models/Plan.ts
import mongoose, { Document } from 'mongoose';

export enum PlanKey {
  FREE = 'FREE',
  ADDITIONAL_100 = 'ADDITIONAL_100',
  MONTHLY_100 = 'MONTHLY_100',
  YEARLY_1200 = 'YEARLY_1200',
}

export enum PlanPeriod {
  ONCE = 'once',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export enum PlanProductType {
  SUBSCRIPTION = 'subscription',
  CONSUMABLE = 'consumable',
}

export interface PlanModel extends Document {
  key: PlanKey;
  name: string;
  explanation: string;
  quota: number;
  period: PlanPeriod;
  price: number;
  currency: string;
  isActive: boolean;
  storeIds?: {
    ios?: string;
    android?: string;
  };
  productType?: PlanProductType;
}

const planSchema = new mongoose.Schema<PlanModel>({
  key: { type: String, required: true, enum: Object.values(PlanKey), unique: true },
  name: { type: String, required: true },
  explanation: { type: String, required: true },
  quota: { type: Number, required: true },
  period: { type: String, enum: PlanPeriod, required: true },
  price: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  isActive: { type: Boolean, default: true },
  storeIds: {
    ios: { type: String },
    android: { type: String },
  },
  productType: { type: String, enum: PlanProductType },
});

export const Plan = mongoose.model<PlanModel>('Plan', planSchema);
