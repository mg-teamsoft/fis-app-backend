// src/services/excelWriterService.ts
import fs from "node:fs/promises";
import path from "node:path";
import { Workbook } from "exceljs";
import { uploadBufferToS3, createPresignedGetUrl } from "./s3Service";
import { buildUserExcelKey } from "../utils/excelKey";
import { ExcelFileModel } from "../models/ExcelFileModel";

export async function saveAndUploadExcel(params: {
  workbook?: Workbook | null; // null = skip write
  userId: string;
  fullName: string;
  now?: Date;                 // optional for testing
  localOutDir?: string;       // optional: keep a local copy too
  presignTtlSec?: number;     // default 900
  useSSE?: boolean;           // set true if your bucket enforces SSE
}) {
  if (!params.workbook) {
    return { status: "error" as const, message: "No workbook provided" };
  }

  const now = params.now ?? new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  
  // 1) Write to a buffer
  const buffer = await params.workbook.xlsx.writeBuffer();

  // 2) (Optional) also persist a local copy for debugging
  if (params.localOutDir) {
    const p = path.join(
      params.localOutDir,
      `${params.fullName}-FİŞ LİSTESİ_${String(month).padStart(2, "0")}${year}.xlsx`
    );
    await fs.writeFile(p, Buffer.from(buffer));
  }

  // 3) Compute S3 key (static file name; single workbook with many sheets)
  const key = buildUserExcelKey(
    params.userId,
    params.fullName,
  );

  // 4) Upload to S3
  await uploadBufferToS3({
    key,
    buffer: Buffer.from(buffer),
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    metadata: {
      userId: params.userId,
      fullName: params.fullName,
      year: String(year),
      month: String(month),
    },
    sse: params.useSSE ? "AES256" : undefined,
  });

  // 5) Return a presigned GET URL for client download
  const url = await createPresignedGetUrl(key, params.presignTtlSec ?? 900);

  return { status: "success" as const, key, url };
}

/**
 * One file per user. Returns an array with 0..1 items for consistency.
 */
export async function listUserExcelFiles(userId: string) {
  const docs = await ExcelFileModel
    .find({ userId })
    .select("_id userId fullName s3Key fileName contentType sheets createdAt updatedAt lastAccessAt")
    .lean();
  return docs; // expect 0 or 1 items
}

/**
 * Presign a fresh GET URL for the user's Excel file.
 * `idOrKey` can be Mongo _id or the s3Key.
 */
export async function presignExcelGetUrl(userId: string, idOrKey: string, ttlSec = 900) {
  // Try by _id first (and enforce same user)
  let rec = await ExcelFileModel.findOne({ _id: idOrKey, userId }).lean();
  if (!rec) {
    // Fallback: treat as s3Key (also enforce same user)
    rec = await ExcelFileModel.findOne({ s3Key: idOrKey, userId }).lean();
  }
  if (!rec) {
    const err: any = new Error("file not found");
    err.code = "NOT_FOUND";
    throw err;
  }

  // bump lastAccessAt (fire and forget)
  void ExcelFileModel.updateOne({ _id: rec._id }, { $set: { lastAccessAt: new Date() } });

  const url = await createPresignedGetUrl(rec.s3Key, ttlSec);
  return {
    url,
    file: {
      _id: rec._id,
      s3Key: rec.s3Key,
      fileName: rec.fileName,
      contentType: rec.contentType,
      sheets: rec.sheets ?? [],
      updatedAt: rec.updatedAt,
    },
    expiresIn: ttlSec,
  };
}