import { Router, Request, Response } from 'express';
import { ReceiptData } from '../types/receiptTypes';
import { auditInterceptor } from '../middleware/auditInterceptor';
import { JwtUtil } from '../utils/jwtUtil';
import { writeReceiptToS3WithMonthlySheets } from '../services/excelWriterWithExcelJs';
import { listUserExcelFiles, presignExcelGetUrl } from '../services/excelWriterService';
import { mapReceiptDataToReceiptModel, normalizeReceiptDataPayload } from '../utils/receiptMapper';
import { createReceiptInternal } from '../controllers/receiptController';
import { validateByUserId } from '../utils/rulesValidator';

const router = Router();

/**
 * @swagger
 * /excel/write:
 *   post:
 *     summary: Append a parsed receipt to the current user's Excel workbook
 *     description: >
 *       Creates a receipt record from the parsed receipt payload, appends the same
 *       receipt to the authenticated user's monthly Excel sheet in S3, and returns
 *       a presigned download URL for the workbook. The `receiptJson` field can be
 *       sent either as a JSON object or as a JSON-stringified ReceiptData payload.
 *     tags: [Excel]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - receiptJson
 *             properties:
 *               key:
 *                 type: string
 *                 description: Optional source S3 key for the receipt image/file.
 *                 example: uploads/64f1b9c2/receipt-2026-06-03.jpg
 *               receiptJson:
 *                 description: Parsed receipt data. At least one of `businessName`, `totalAmount`, or `kdvAmount` must be present.
 *                 oneOf:
 *                   - $ref: '#/components/schemas/ReceiptData'
 *                   - type: string
 *                     description: JSON stringified ReceiptData
 *             example:
 *               key: uploads/64f1b9c2/receipt-2026-06-03.jpg
 *               receiptJson:
 *                 businessName: ACME Market
 *                 businessTaxNo: "1234567890"
 *                 transactionDate: "03.06.2026"
 *                 receiptNumber: FIS-20260603-001
 *                 products:
 *                   - name: Coffee
 *                     quantity: 2
 *                     unitPrice: 45
 *                     lineTotal: 90
 *                 kdvAmount: 15
 *                 totalAmount: 90
 *                 transactionType:
 *                   type: purchase
 *                   kdvRate: 20
 *                 paymentType: credit_card
 *           examples:
 *             receiptObject:
 *               summary: ReceiptData object
 *               value:
 *                 key: uploads/64f1b9c2/receipt-2026-06-03.jpg
 *                 receiptJson:
 *                   businessName: ACME Market
 *                   businessTaxNo: "1234567890"
 *                   transactionDate: "03.06.2026"
 *                   receiptNumber: FIS-20260603-001
 *                   products:
 *                     - name: Coffee
 *                       quantity: 2
 *                       unitPrice: 45
 *                       lineTotal: 90
 *                   kdvAmount: 15
 *                   totalAmount: 90
 *                   transactionType:
 *                     type: purchase
 *                     kdvRate: 20
 *                   paymentType: credit_card
 *             receiptJsonString:
 *               summary: JSON-stringified ReceiptData
 *               value:
 *                 key: uploads/64f1b9c2/receipt-2026-06-03.jpg
 *                 receiptJson: '{"businessName":"ACME Market","businessTaxNo":"1234567890","transactionDate":"03.06.2026","receiptNumber":"FIS-20260603-001","products":[{"name":"Coffee","quantity":2,"unitPrice":45,"lineTotal":90}],"kdvAmount":15,"totalAmount":90,"transactionType":{"type":"purchase","kdvRate":20},"paymentType":"credit_card"}'
 *     responses:
 *       200:
 *         description: Receipt saved and appended to Excel
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Satır eklendi.
 *                 filePath:
 *                   type: string
 *                   format: uri
 *                   description: Presigned workbook download URL.
 *                 sheet:
 *                   type: string
 *                   description: Monthly worksheet name that received the new row.
 *                   example: Haziran 26
 *                 row:
 *                   type: integer
 *                   description: Row number appended in the worksheet.
 *                   example: 4
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: error
 *                 message:
 *                   type: string
 *                   example: Missing key fields (e.g., businessName or amounts).
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Write failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: error
 *                 message:
 *                   type: string
 *                   example: Failed to write Excel
 */
router.post('/write',
  auditInterceptor("FILE_WRITE"),
  async (req: Request, res: Response) => {
    const { userId, fullname } = await JwtUtil.extractUser(req); const body = req.body as { key?: string; receiptJson?: ReceiptData | string } | undefined;
    if (!userId) {
      return { ok: false, status: 401, body: { message: 'Unauthorized' } };
    }
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

    if (payload) {
      payload = normalizeReceiptDataPayload(payload);
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

    const ruleCheck = await validateByUserId(userId, payload);
    if (!ruleCheck.ok) {
      res.locals.auditMessage = ruleCheck.reason;
      res.locals.auditPayload = {
        userId,
        ruleViolation: ruleCheck.reason,
        preview: {
          businessName: payload.businessName,
          transactionDate: payload.transactionDate,
          totalAmount: payload.totalAmount,
          transactionType: payload.transactionType?.type ?? null,
        },
      };
      return res.status(200).json({
        status: 'error',
        message: ruleCheck.reason,
      });
    }

    const receiptModelObject = mapReceiptDataToReceiptModel(payload, userId, '', sourceKey);
    const createReceiptResult = await createReceiptInternal(req, {
      bodyOverride: receiptModelObject,
    });

    if (!createReceiptResult.ok) {
      console.error('Failed to create receipt from /excel/write flow:', createReceiptResult.body);
      return res.status(createReceiptResult.status).json({
        status: 'error',
        ...(createReceiptResult.body ?? { message: 'Receipt create failed.' }),
      });
    }
    console.log('Receipt saved to database for user:', userId);

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
