import { nextNotificationMonth } from "../utils/notificationDates";
import { Document, Schema, model, models } from "mongoose";

export const NOTIFICATION_CATEGORIES = ['campaign', 'version', 'news', 'contactNotes'] as const;
export type NotificationCategory = typeof NOTIFICATION_CATEGORIES[number];

export interface NotificationDoc extends Document {
  notificationId: string;
  userId?: string | null;
  title: string;
  subtitle: string;
  content: string;
  version?: string;
  category?: NotificationCategory;
  time: string;
  actionType?: string | null;
  screen?: string | null;
  isUnread: boolean;
  startDate: Date;
  endDate: Date;
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
    version: { type: String, required: false, trim: true },
    category: { type: String, required: false, enum: NOTIFICATION_CATEGORIES },
    time: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true, default: Date.now },
    endDate: {
      type: Date, required: true,
      default: function(this: NotificationDoc) { return nextNotificationMonth(this.startDate ?? new Date()); },
      validate: { validator: function(this: NotificationDoc, value: Date) { return value > this.startDate; }, message: 'endDate must be after startDate' },
    },
    actionType: { type: String, required: false, trim: true },
    screen: { type: String, required: false, trim: true },
    isUnread: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

NotificationSchema.index({ userId: 1, createdAt: -1 });

export const NotificationModel =
  (models.Notification as any) ||
  model<NotificationDoc>("Notification", NotificationSchema);
