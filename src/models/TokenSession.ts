import { Schema, model, models, Document } from "mongoose";
import crypto from "crypto";

export interface TokenSessionDoc extends Document {
  tokenHash: string;         // SHA256 of raw token
  jti?: string | null;       // from JWT if present
  userId?: string | null;    // from JWT (sub or preferred_username, etc.)
  userName?: string | null;  // from JWT
  issuer?: string | null;    // iss
  audience?: string | null;  // aud
  expiresAt: Date;           // TTL field (Mongo deletes automatically)
  createdAt: Date;
  revoked?: boolean;
}

const TokenSessionSchema = new Schema<TokenSessionDoc>(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    jti: { type: String, default: null, index: true },
    userId: { type: String, default: null, index: true },
    userName: { type: String, default: null },
    issuer: { type: String, default: null },
    audience: { type: String, default: null },
    revoked: { type: Boolean, default: false },

    // TTL index: when now > expiresAt, MongoDB will delete the doc automatically
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const TokenSession =
  models.TokenSession || model<TokenSessionDoc>("TokenSession", TokenSessionSchema);

// Helper to hash tokens so you don't store raw tokens
export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}