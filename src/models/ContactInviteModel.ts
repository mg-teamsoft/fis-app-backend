import { Schema, model, models, Document } from "mongoose";

export type InviteStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "REVOKED"
  | "EXPIRED";

export interface ContactInviteDoc extends Document {
  inviteId: string;            // internal unique id
  inviterUserId: string;       // customer (User.userId)
  inviteeEmail: string;        // supervisor email (match by email)
  inviteeUserId?: string | null; // set on accept (User.userId)
  status: InviteStatus;

  // token is only stored as hash for security
  tokenHash: string;

  permissions: string[];       // e.g. ["VIEW_RECEIPTS", "DOWNLOAD_FILES"]
  expiresAt: Date;
  respondedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ContactInviteSchema = new Schema<ContactInviteDoc>(
  {
    inviteId: { type: String, required: true, unique: true, index: true },

    inviterUserId: { type: String, required: true, index: true },
    inviteeEmail: { type: String, required: true, index: true },
    inviteeUserId: { type: String, default: null, index: true },

    status: {
      type: String,
      required: true,
      index: true,
      enum: ["PENDING", "ACCEPTED", "REJECTED", "REVOKED", "EXPIRED"],
      default: "PENDING",
    },

    tokenHash: { type: String, required: true, unique: true, index: true },

    permissions: {
      type: [String],
      default: ["VIEW_RECEIPTS", "DOWNLOAD_FILES"],
    },

    expiresAt: { type: Date, required: true, index: true },
    respondedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Avoid spamming the same supervisor with multiple pending invites from same customer.
// Allows multiple invites historically (ACCEPTED/REJECTED/REVOKED) but limits PENDING.
ContactInviteSchema.index(
  { inviterUserId: 1, inviteeEmail: 1, status: 1 },
  { name: "uniq_pending_invite_per_email" }
);

export const ContactInviteModel =
  (models.ContactInvite as any) ||
  model<ContactInviteDoc>("ContactInvite", ContactInviteSchema);