import { Schema, model, Document } from "mongoose";

export type ProductType = "subscription" | "consumable";

export interface PurchaseTransactionDoc extends Document {
  userId: string;
  platform: "ios";
  productId: string;
  productType: ProductType;
  transactionId: string; // unique per purchase
  originalTransactionId?: string; // subscriptions
  purchaseDate?: Date;
  expiresDate?: Date; // subscriptions
  status: "verified" | "rejected";
  raw?: Record<string, any>;
}

const PurchaseTransactionSchema = new Schema<PurchaseTransactionDoc>(
  {
    userId: { type: String, required: true, index: true },
    platform: { type: String, enum: ["ios"], required: true, default: "ios" },
    productId: { type: String, required: true, index: true },
    productType: { type: String, enum: ["subscription", "consumable"], required: true },
    transactionId: { type: String, required: true },
    originalTransactionId: { type: String },
    purchaseDate: { type: Date },
    expiresDate: { type: Date },
    status: { type: String, enum: ["verified", "rejected"], required: true },
    raw: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

// Prevent double-grant by same transaction
PurchaseTransactionSchema.index({ platform: 1, transactionId: 1 }, { unique: true });

export const PurchaseTransaction = model<PurchaseTransactionDoc>(
  "PurchaseTransaction",
  PurchaseTransactionSchema
);