// src/routes/job.ts
import { Router, Request, Response } from "express";
import { JobModel } from "../models/JobModel";
import { JwtUtil } from "../utils/jwtUtil";

const router = Router();

/**
 * @swagger
 * /job/{jobId}:
 *   get:
 *     summary: Get a single job you own
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Job detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 job:
 *                   $ref: '#/components/schemas/Job'
 *       404:
 *         description: Job not found
 *       500:
 *         description: Server error
 */
router.get("/:jobId", async (req: Request, res: Response) => {
  try {
    const { userId: userId, fullname: userName } = await JwtUtil.extractUser(req);
    const { jobId } = req.params;

    console.log(`Fetching job ${jobId} for user ${userId}`);
    const job = await JobModel.findOne({ jobId, userId });
    if (!job) {
      return res.status(404).json({ status: "error", message: "Job not found" });
    }
    return res.json({
      status: "success",
      job: {
        jobId: job.jobId,
        userId: job.userId,
        sourceKey: job.sourceKey,
        status: job.status,
        receipt: job.receipt ?? null,
        error: job.error ?? null,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        finishedAt: job.finishedAt ?? null,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ status: "error", message: e.message || "Failed to get job" });
  }
});

/**
 * @swagger
 * /job:
 *   get:
 *     summary: List your jobs
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [queued, processing, done, error]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Paged list of jobs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 total:
 *                   type: integer
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/JobListItem'
 *       500:
 *         description: Server error
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { userId: userId, fullname: userName } = await JwtUtil.extractUser(req);
    const status = (req.query.status as string | undefined)?.toLowerCase();
    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limitRaw = Math.max(1, parseInt((req.query.limit as string) || "20", 10));
    const limit = Math.min(limitRaw, 100);
    const skip = (page - 1) * limit;

    const query: any = { userId };
    if (status && ["queued", "processing", "done", "error"].includes(status)) {
      query.status = status;
    }

    const [items, total] = await Promise.all([
      JobModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      JobModel.countDocuments(query),
    ]);

    return res.json({
      status: "success",
      page,
      limit,
      total,
      items: items.map((j) => ({
        jobId: j.jobId,
        userId: j.userId,
        sourceKey: j.sourceKey,
        status: j.status,
        // omit receipt by default in list for payload size; fetch via /:jobId or /:jobId/receipt
        createdAt: j.createdAt,
        updatedAt: j.updatedAt,
        finishedAt: j.finishedAt ?? null,
      })),
    });
  } catch (e: any) {
    return res.status(500).json({ status: "error", message: e.message || "Failed to list jobs" });
  }
});

/**
 * @swagger
 * /job/{jobId}/receipt:
 *   get:
 *     summary: Get parsed receipt JSON for a job
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Receipt (or null if still processing)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 receipt:
 *                   $ref: '#/components/schemas/ReceiptData'
 *                   nullable: true
 *                 message:
 *                   type: string
 *       404:
 *         description: Job not found
 *       500:
 *         description: Server error
 */
router.get("/:jobId/receipt", async (req: Request, res: Response) => {
  try {
    const { userId: userId, fullname: userName } = await JwtUtil.extractUser(req);
    const { jobId } = req.params;

    const job = await JobModel.findOne({ jobId, userId }, { receipt: 1, status: 1 });
    if (!job) {
      return res.status(404).json({ status: "error", message: "Job not found" });
    }
    if (!job.receipt) {
      return res.json({ status: "success", receipt: null, message: `No receipt yet (status: ${job.status})` });
    }
    return res.json({ status: "success", receipt: job.receipt });
  } catch (e: any) {
    return res.status(500).json({ status: "error", message: e.message || "Failed to get receipt" });
  }
});

/**
 * @swagger
 * /job/{jobId}:
 *   delete:
 *     summary: Delete a job you own
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Job deleted
 *       404:
 *         description: Job not found or not owned by user
 *       500:
 *         description: Server error
 */
router.delete("/:jobId", async (req: Request, res: Response) => {
  try {
    const { userId: userId, fullname: userName } = await JwtUtil.extractUser(req);
    const { jobId } = req.params;

    const job = await JobModel.findOneAndDelete({ jobId, userId });
    if (!job) {
      return res.status(404).json({ status: "error", message: "Job not found or not owned by user" });
    }
    return res.json({ status: "success", message: "Job deleted", jobId });
  } catch (e: any) {
    return res.status(500).json({ status: "error", message: e.message || "Failed to delete job" });
  }
});

export default router;
