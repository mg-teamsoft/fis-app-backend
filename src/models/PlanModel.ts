// models/Plan.ts
import mongoose, { Document } from 'mongoose';

export interface PlanModel extends Document {
  key: 'FREE' | 'ADDITIONAL' | 'MONTHLY' | 'YEARLY';
  name: string;
  explanation: string;
  quota: number;
  period: 'monthly' | 'yearly' | 'once';
  price: number;
  currency: string;
}

const planSchema = new mongoose.Schema<PlanModel>({
  key: { type: String, required: true, enum: ['FREE', 'ADDITIONAL', 'MONTHLY', 'YEARLY'], unique: true },
  name: { type: String, required: true },
  explanation: { type: String, required: true },
  quota: { type: Number, required: true },
  period: { type: String, enum: ['monthly', 'yearly', 'once'], required: true },
  price: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
});

export const Plan = mongoose.model<PlanModel>('Plan', planSchema);