import { Schema, model, Document } from "mongoose";

export interface JobDoc extends Document {
  jobId: string;          // UUID assigned at startJobFromBuffer
  userId: string;         // who started the job
  sourceKey: string;      // S3 key of the uploaded file
  status: "queued" | "processing" | "done" | "error";
  receipt?: any;          // parsed receipt JSON (optional)
  error?: string;         // error message if status=error
  createdAt: Date;
  updatedAt: Date;
  finishedAt?: Date;
}

const jobSchema = new Schema<JobDoc>(
  {
    jobId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    sourceKey: { type: String, required: true },
    status: {
      type: String,
      enum: ["queued", "processing", "done", "error"],
      default: "queued",
    },
    receipt: { type: Schema.Types.Mixed },   // can hold JSON object
    error: { type: String },
    finishedAt: { type: Date },
  },
  {
    timestamps: true, // adds createdAt + updatedAt
  }
);

export const JobModel = model<JobDoc>("Job", jobSchema);