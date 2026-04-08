import { Document, Schema, model, models } from "mongoose";

export interface NotificationUserStateDoc extends Document {
  userId: string;
  notificationId: string;
  isUnread: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationUserStateSchema = new Schema<NotificationUserStateDoc>(
  {
    userId: { type: String, required: true, index: true },
    notificationId: { type: String, required: true, index: true },
    isUnread: { type: Boolean, required: true, default: false, index: true },
  },
  { timestamps: true }
);

NotificationUserStateSchema.index(
  { userId: 1, notificationId: 1 },
  { unique: true, name: "uniq_notification_user_state" }
);

export const NotificationUserStateModel =
  (models.NotificationUserState as any) ||
  model<NotificationUserStateDoc>("NotificationUserState", NotificationUserStateSchema);
