import { Schema, model, models, Document } from "mongoose";

export interface ContactLinkDoc extends Document {
  linkId: string;              // internal unique id
  customerUserId: string;      // customer (User.userId)
  supervisorUserId: string;    // supervisor (User.userId)
  permissions: string[];       // ["VIEW_RECEIPTS", "DOWNLOAD_FILES"]
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  revokedAt?: Date | null;
}

const ContactLinkSchema = new Schema<ContactLinkDoc>(
  {
    linkId: { type: String, required: true, unique: true, index: true },

    customerUserId: { type: String, required: true, index: true },
    supervisorUserId: { type: String, required: true, index: true },

    permissions: {
      type: [String],
      default: ["VIEW_RECEIPTS", "DOWNLOAD_FILES"],
    },

    isActive: { type: Boolean, default: true, index: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Only one link between a given customer-supervisor pair.
// If you want to allow re-invite after revoke, keep the record and flip isActive.
ContactLinkSchema.index(
  { customerUserId: 1, supervisorUserId: 1 },
  { unique: true, name: "uniq_customer_supervisor_link" }
);

export const ContactLinkModel =
  (models.ContactLink as any) ||
  model<ContactLinkDoc>("ContactLink", ContactLinkSchema);