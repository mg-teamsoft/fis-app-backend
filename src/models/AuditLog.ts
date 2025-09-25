import { Schema, model, models } from "mongoose";

export type AuditAction = "IMAGE_UPLOAD" | "FILE_WRITE" | "RULE_WRITE" | "RULE_GET" | "CHECK_WRITE" | "LIST_EXCEL" ;
export interface AuditLog {
  requestId: string;
  action: AuditAction;
  userId?: string | null;
  userName?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  status: "success" | "error";
  message?: string | null;
  payload?: Record<string, any> | null; // e.g. file names, counts, receipt preview
  createdAt: Date;
  latencyMs?: number | null;
}

const AuditLogSchema = new Schema<AuditLog>(
  {
    requestId: { type: String, index: true, required: true },
    action: { type: String, enum: ["UPLOAD", "WRITE"], required: true },
    userId: { type: String, default: null, index: true },
    userName: { type: String, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    status: { type: String, enum: ["success", "error"], required: true },
    message: { type: String, default: null },
    payload: { type: Schema.Types.Mixed, default: null },
    latencyMs: { type: Number, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const AuditLogModel = models.AuditLog || model<AuditLog>("AuditLog", AuditLogSchema);