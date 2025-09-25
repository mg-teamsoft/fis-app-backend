// src/models/asset.model.ts
import mongoose, { Schema, InferSchemaType } from "mongoose";

const AssetSchema = new Schema(
  {
    userId: { type: String, index: true },
    sha256: { type: String, required: true, index: true , unique: false}, // hex (lowercase) or base64; pick one
    key: { type: String, required: true, unique: true },
    size: { type: Number },
    contentType: { type: String },
    createdAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date, default: Date.now },
    lastJobId: { type: String, default: null },
  },
  { versionKey: false }
);

// AssetSchema.index({ sha256: 1 }, { unique: false });

export type AssetDoc = InferSchemaType<typeof AssetSchema>;
export const AssetModel = mongoose.model<AssetDoc>("assets", AssetSchema);