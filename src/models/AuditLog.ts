import { Schema, model, models } from "mongoose";

export const AUDIT_ACTIONS = [
  "IMAGE_UPLOAD",
  "HOME_SUMMARY",
  "FILE_WRITE",
  "RULE_WRITE",
  "RULE_GET",
  "TEMPLATE_WRITE",
  "FILE_LIST",
  "PLAN_LIST",
  "PLAN_WRITE",
  "PLAN_UPDATE",
  "PLAN_GET",
  "PLAN_DELETE",
  "PLAN_PURCHASE",
  "RECEIPT_CREATE",
  "RECEIPT_LIST",
  "RECEIPT_LIST_ITEM",
  "RECEIPT_DETAIL",
  "RECEIPT_EXPORT",
  "USER_LIST",
  "USER_GET",
  "USER_CREATE",
  "USER_UPDATE",
  "USER_DELETE",
  "USER_PLAN_LIST",
  "USER_PLAN_BY_USER",
  "USER_PLAN_GET",
  "USER_PLAN_DETAILS",
] as const;

export type AuditAction = typeof AUDIT_ACTIONS[number];

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
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
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
