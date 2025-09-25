import { Router } from "express";
import { randomUUID } from "crypto";
import { awsConfig } from "../configs/aws";
import { createPresignedGetUrl, headObject, createPresignedPutUrlWithInput } from "../services/s3Service";
import { JwtUtil } from "../utils/jwtUtil";
import { normalizeSha256 } from "../utils/hashUtil";
import { AssetModel } from "../models/AssetModel";

// Shape the key: prefix/userId/yyyy/mm/uuid.ext
function buildKey(userId: string, originalName?: string) {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const ext = (originalName?.split(".").pop() || "jpg").toLowerCase();
  return `${awsConfig.uploadPrefix}${userId}/${yyyy}/${mm}/${randomUUID()}.${ext}`;
}

const router = Router();

// POST /file/init
// body: { contentType: "image/jpeg", filename?: "foo.jpg", checksumCRC32?, sha256 }
router.post("/init", async (req, res) => {
  try {
    const { userId, fullname } = await JwtUtil.extractUser(req);
    const { contentType = "image/jpeg", filename, checksumCRC32, sha256 } = req.body || {};

    if (!sha256) {
      return res.status(400).json({ status: "error", message: "sha256 required" });
    }

    const sha256Hex = normalizeSha256(sha256);
    // 1) Check DB for existing asset with same sha256
    const existing = await AssetModel.findOne({ sha256: sha256Hex }).lean();
    if (existing) {
      // Optionally verify it still exists in S3 (cheap HEAD)
      try {
        await headObject(existing.key);
      } catch {
        // If the object is gone, we can fall through to presign again
      }

      return res.json({
        status: "duplicate",
        key: existing.key,
        bucket: awsConfig.bucket,
        message: "Duplicate content detected",
        existingJobId: existing.lastJobId || null,
      });
    }

    // 2) Build deterministic key using hash (dedupe at storage level too)
    const key = buildKey(userId, filename);
    
    // 3) Presign PUT with headers you intend to send
    const input = {
      Bucket: awsConfig.bucket,
      Key: key,
      ContentType: contentType,
      ChecksumCRC32: checksumCRC32,
    };
    const presignedUrl = await createPresignedPutUrlWithInput(input);

    // 4) Provisionally upsert the asset record (without size yet).
    await AssetModel.updateOne(
      { sha256: sha256Hex },
      {
        $setOnInsert: {
          sha256: sha256Hex,
          key,
          userId,
          contentType,
          createdAt: new Date(),
        },
        $set: { lastUsedAt: new Date() },
      },
      { upsert: true }
    );

    // 5) Return presigned URL to client
    res.json({
      status: "success",
      key,
      bucket: awsConfig.bucket,
      presignedUrl,
      headers: {
        "Content-Type": contentType,
        ...(checksumCRC32 ? { "x-amz-checksum-crc32": checksumCRC32 } : {}),
      },
      expiresIn: awsConfig.presignExpires,
    });
  } catch (e: any) {
    console.error("files/init error:", e);
    res.status(500).json({ status: "error", message: e.message || "init failed" });
  }
});

// POST /file/confirm
// body: { key: "receipts/...", size?: number, mime?: string, sha256?: string }
router.post("/confirm", async (req, res) => {
  try {
    const { key, size, mime, sha256 } = req.body || {};
    if (!key) return res.status(400).json({ status: "error", message: "key required" });

    // sanity check: ensure object exists
    const head = await headObject(key);

    // TODO: persist DB record here (file index) if you have a files collection
    // const fileId = await filesRepo.insert({ userId, key, size: size || head.ContentLength, mime: mime || head.ContentType, sha256, createdAt: new Date() });

    // enqueue OCR job based on key (see /upload/by-key route below or call service directly)
    // const jobId = await jobProcessor.startFromS3Key({ userId, key });

    res.json({
      status: "success",
      message: "confirmed",
      key,
      size: size ?? head.ContentLength,
      mime: mime ?? head.ContentType,
      // fileId,
      // jobId,
    });
  } catch (e: any) {
    res.status(500).json({ status: "error", message: e.message || "confirm failed" });
  }
});

// GET /files/view-url?key=...
router.get("/view-url", async (req, res) => {
  try {
    const key = String(req.query.key || "");
    if (!key) return res.status(400).json({ status: "error", message: "key required" });

    const url = await createPresignedGetUrl(key, 300);
    res.json({ status: "success", key, url, expiresIn: 300 });
  } catch (e: any) {
    res.status(500).json({ status: "error", message: e.message || "view-url failed" });
  }
});

export default router;