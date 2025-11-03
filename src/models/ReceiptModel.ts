import { Schema, model, Document } from 'mongoose';

// TypeScript Interface
export interface ReceiptModel extends Document {
  userId: string;                 // who owns these rules
  businessName: string;
  receiptNumber: string;
  totalAmount: number;
  vatAmount: number;
  vatRate: number;
  transactionDate: Date;
  transactionType: string;
  paymentType: string;
  imageUrl: string;
  sourceKey?: string;
}

const ReceiptSchema = new Schema<ReceiptModel>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    businessName: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    receiptNumber: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    vatAmount: {
      type: Number,
      required: true,
    },
    vatRate: {
      type: Number,
      required: true,
    },
    transactionDate: {
      type: Date,
      required: true,
      index: true,
    },
    transactionType: {
      type: String,
      required: true,
    },
    paymentType: {
      type: String,
      required: true,
    },
    imageUrl: {
      type: String,
      required: false,
    },
    sourceKey: {
      type: String,
      required: false,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// ✅ Compound Unique Index
ReceiptSchema.index(
  { businessName: 1, receiptNumber: 1, transactionDate: 1, userId: 1 },
  { unique: true }
);

// ✅ Additional Search Index for filtering (optional but recommended)
ReceiptSchema.index({ userId: 1, businessName: 1, receiptNumber: 1, transactionDate: -1 });
ReceiptSchema.index({ userId: 1, companyName: 1 });

// Create and export model
const ReceiptModel = model<ReceiptModel>('Receipts', ReceiptSchema);
export default ReceiptModel;
