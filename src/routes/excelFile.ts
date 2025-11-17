import { Router, Request, Response } from 'express';
import { ReceiptData } from '../types/receiptTypes';
import { auditInterceptor } from '../middleware/auditInterceptor';
import { JwtUtil } from '../utils/jwtUtil';
import { writeReceiptToS3WithMonthlySheets } from '../services/excelWriterWithExcelJs';
import { listUserExcelFiles, presignExcelGetUrl } from '../services/excelWriterService';
import ReceiptModel from '../models/ReceiptModel';
import { mapReceiptDataToReceiptModel } from '../utils/receiptMapper';

const router = Router();

/**
 * @swagger
 * /excel/write:
 *   post:
 *     summary: Append a parsed receipt into the user Excel workbook (S3)
 *     tags: [Excel]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               key:
 *                 type: string
 *                 description: Optional source key of the file being written
 *               receiptJson:
 *                 oneOf:
 *                   - $ref: '#/components/schemas/ReceiptData'
 *                   - type: string
 *                     description: JSON stringified ReceiptData
 *     responses:
 *       200:
 *         description: Receipt appended to Excel
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 message:
 *                   type: string
 *                 filePath:
 *                   type: string
 *       400:
 *         description: Validation error
 *       500:
 *         description: Write failed
 */
router.post('/write',
  auditInterceptor("FILE_WRITE"),
  async (req: Request, res: Response) => {
    const { userId, fullname } = await JwtUtil.extractUser(req); const body = req.body as { key?: string; receiptJson?: ReceiptData | string } | undefined;
    const sourceKey = body?.key;
    const rawReceipt = body?.receiptJson;

    let payload: ReceiptData | undefined;
    if (typeof rawReceipt === 'string') {
      try {
        payload = JSON.parse(rawReceipt) as ReceiptData;
      } catch (parseErr) {
        console.error('Failed to parse receiptJson string:', parseErr);
        return res.status(400).json({
          status: 'error',
          message: 'Invalid receiptJson payload; expected valid JSON string.',
        });
      }
    } else {
      payload = rawReceipt;
    }

    if (!payload && rawReceipt) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid receiptJson payload; expected valid ReceiptData JSON.',
      });
    }

    if (!payload) {
      return res.status(400).json({
        status: 'error',
        message: 'Request body is empty or invalid. Expecting { key, receiptJson }.',
      });
    }

    // Minimal sanity check (customize as needed)
    if (!payload.totalAmount && !payload.kdvAmount && !payload.businessName) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing key fields (e.g., businessName or amounts).',
      });
    }

    let savedReceiptId: string | null = null;
    try {
      const receiptModelObject = mapReceiptDataToReceiptModel(payload, userId, '', sourceKey);
      const savedReceipt = await ReceiptModel.create(receiptModelObject);
      savedReceiptId = savedReceipt.id.toString();
      console.log('Receipt saved to database for user:', userId);
    } catch (e: any) {
      if (e.code === 11000) {
        // Duplicate key error
        console.error('Duplicate receipt already exists.');
        return res.status(401).json({
          status: 'error',
          message: 'Duplicate receipt already exists with businessName, receiptNumber and date).',
        });
      }
      console.error('Failed to save receipt to database:', e);
    }

    const result = await writeReceiptToS3WithMonthlySheets(userId, fullname, payload);
    console.log(`Excel write result for user ${userId}:`, result);
    return res.status(result.status === 'success' ? 200 : 500).json(result);
  });

/**
 * @swagger
 * /excel/files:
 *   get:
 *     summary: List Excel workbooks for the current user
 *     tags: [Excel]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Excel file metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 files:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Error listing files
 */
router.get("/files", auditInterceptor("FILE_LIST"), async (req, res) => {
  try {
    const { userId, fullname } = await JwtUtil.extractUser(req); const payload = req.body as ReceiptData | undefined;
    if (!userId) {
      return res.status(401).json({ status: "error", message: "unauthorized" });
    }

    const files = await listUserExcelFiles(userId);
    return res.json({ status: "success", files });
  } catch (e: any) {
    console.error("GET /excel/files error:", e);
    return res
      .status(500)
      .json({ status: "error", message: e.message || "list failed" });
  }
});

/**
 * @swagger
 * /excel/files/{id}/presign:
 *   get:
 *     summary: Get a presigned GET URL for an Excel file
 *     tags: [Excel]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Mongo _id or S3 key
 *     responses:
 *       200:
 *         description: Presigned URL
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 key:
 *                   type: string
 *                 url:
 *                   type: string
 *                 expiresIn:
 *                   type: number
 *       404:
 *         description: File not found
 *       500:
 *         description: Presign failed
 */
router.get("/files/:id/presign", async (req, res) => {
  try {
    const { userId, fullname } = await JwtUtil.extractUser(req); const payload = req.body as ReceiptData | undefined;
    if (!userId) {
      return res.status(401).json({ status: "error", message: "unauthorized" });
    }

    const idOrKey = req.params.id;
    const result = await presignExcelGetUrl(userId, idOrKey, 900);

    return res.json({ status: "success", ...result });
  } catch (e: any) {
    if (e?.code === "NOT_FOUND") {
      return res
        .status(404)
        .json({ status: "error", message: "file not found" });
    }
    console.error("GET /excel/files/:id/presign error:", e);
    return res
      .status(500)
      .json({ status: "error", message: e.message || "presign failed" });
  }
});

export default router;
