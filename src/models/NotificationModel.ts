import { Document, Schema, model, models } from "mongoose";

export interface NotificationDoc extends Document {
  notificationId: string;
  userId?: string | null;
  title: string;
  subtitle: string;
  content: string;
  time: string;
  isUnread: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<NotificationDoc>(
  {
    notificationId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: false, index: true, default: null },
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, required: true, trim: true },
    content: { type: String, default: "" },
    time: { type: String, required: true, trim: true },
    isUnread: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

NotificationSchema.index({ userId: 1, createdAt: -1 });

export const NotificationModel =
  (models.Notification as any) ||
  model<NotificationDoc>("Notification", NotificationSchema);
