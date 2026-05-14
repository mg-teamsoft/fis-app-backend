import { Schema, model, models, Document } from "mongoose";

export type AccountDeletionJobStatus = "queued" | "running" | "done" | "failed";

export interface AccountDeletionJobDoc extends Document {
  jobId: string;
  userId?: string | null;
  status: AccountDeletionJobStatus;
  attempts: number;
  deletedRecords: Record<string, number>;
  deletedS3Objects: number;
  s3DeletedCounts: Array<{ prefix: string; deletedCount: number }>;
  error?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const AccountDeletionJobSchema = new Schema<AccountDeletionJobDoc>(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, default: null, index: true },
    status: {
      type: String,
      enum: ["queued", "running", "done", "failed"],
      required: true,
      default: "queued",
      index: true,
    },
    attempts: { type: Number, default: 0 },
    deletedRecords: { type: Schema.Types.Mixed, default: {} },
    deletedS3Objects: { type: Number, default: 0 },
    s3DeletedCounts: {
      type: [
        {
          prefix: { type: String, required: true },
          deletedCount: { type: Number, required: true },
        },
      ],
      default: [],
    },
    error: { type: String, default: null },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const AccountDeletionJobModel =
  (models.AccountDeletionJob as any) ||
  model<AccountDeletionJobDoc>("AccountDeletionJob", AccountDeletionJobSchema);
