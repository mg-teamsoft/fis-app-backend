// src/models/excelFile.model.ts
import mongoose, { Schema, InferSchemaType } from "mongoose";

const ExcelFileSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true }, // <- single file per user
    fullName: { type: String, default: "Kullanıcı" },
    s3Key: { type: String, required: true }, // stable: receipts/excel/<userId>/<Name>-FİŞ LİSTESİ.xlsx
    contentType: {
      type: String,
      default: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
    fileName: { type: String }, // display name
    sheets: [{ type: String }], // optional: track existing sheets
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    lastAccessAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export type ExcelFileDoc = InferSchemaType<typeof ExcelFileSchema>;
export const ExcelFileModel = mongoose.model<ExcelFileDoc>("excelfiles", ExcelFileSchema);