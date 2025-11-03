// models/UserPlan.ts
import mongoose, { Document } from 'mongoose';

export interface UserPlanModel extends Document {
  userId: string;
  planKey: string;
  quota: number;           // how many scans are remaining
  period: string;
  startDate: Date;
  endDate: Date | null;    // null if unlimited (e.g., one-time pack)
  isActive: boolean;
}

const userPlanSchema = new mongoose.Schema<UserPlanModel>({
  userId: { type: String, required: true, index: true },
  planKey: { type: String, required: true },
  quota: { type: Number, required: true },
  period: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  isActive: { type: Boolean, default: true },
});

export const UserPlan = mongoose.model<UserPlanModel>('UserPlan', userPlanSchema);