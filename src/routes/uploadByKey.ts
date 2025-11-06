import { Router } from "express";
import { getObjectBuffer } from "../services/s3Service";
import { startJobFromBuffer } from "../services/jobProcessor"; // add function below
import { JwtUtil } from "../utils/jwtUtil";
import { requireVerifiedEmail } from "../middleware/requireVerifiedEmail";

const router = Router();

// POST /upload/by-key
// body: { key: "receipts/.../uuid.jpg", mime?: "image/jpeg" }
router.post("/by-key", requireVerifiedEmail, async (req, res) => {
  try {
    const { userId: userId, fullname: userName } = await JwtUtil.extractUser(req);
    const { key, mime } = req.body || {};
    if (!key) return res.status(400).json({ status: "error", message: "key required" });

    // 1) Write to a buffer
    const buffer = await getObjectBuffer(key);

    // Kick off your existing pipeline using the buffer
    const job = await startJobFromBuffer({
      userId,
      sourceKey: key,
      mime: mime || "image/jpeg",
      buffer,
    });

    res.json({ status: "success", jobId: job.jobId, message: "processing started" });
  } catch (e: any) {
    res.status(500).json({ status: "error", message: e.message || "by-key failed" });
  }
});

export default router;