import { Router } from "express";
import { getObjectBuffer } from "../services/s3Service";
import { startJobFromBuffer } from "../services/jobProcessor"; // add function below
import { JwtUtil } from "../utils/jwtUtil";
import { requireVerifiedEmail } from "../middleware/requireVerifiedEmail";

const router = Router();

/**
 * @swagger
 * /upload/by-key:
 *   post:
 *     summary: Start async OCR job from an object already in S3
 *     description: Requires a verified email. Use /file/init to get a presigned URL first, then call this to start processing.
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [key]
 *             properties:
 *               key:
 *                 type: string
 *                 description: S3 object key (e.g., receipts/{userId}/2024/05/uuid.jpg)
 *               mime:
 *                 type: string
 *                 description: Optional content-type override
 *     responses:
 *       200:
 *         description: Job created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 jobId:
 *                   type: string
 *                 message:
 *                   type: string
 *       400:
 *         description: Missing key
 *       500:
 *         description: Server error starting job
 */
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
