import { Router, Request, Response } from 'express';
import { ReceiptData } from '../types/receiptTypes';
import { auditInterceptor } from '../middleware/auditInterceptor';
import { JwtUtil } from '../utils/jwtUtil';
import { writeReceiptToS3WithMonthlySheets } from '../services/excelWriterWithExcelJs';
import { listUserExcelFiles, presignExcelGetUrl } from '../services/excelWriterService';

const router = Router();

/**
 * @route POST /excel/write
 * @desc  Write a single ReceiptData row into output/receipts.xlsx
 * @body  ReceiptData JSON
 * @returns { status: "success"|"error", message: string, filePath?: string }
 */
router.post('/write', 
    auditInterceptor("FILE_WRITE"),
    async (req: Request, res: Response) => {
  const { userId, fullname } = await JwtUtil.extractUser(req);  const payload = req.body as ReceiptData | undefined;
  
  if (!payload) {
    return res.status(400).json({
      status: 'error',
      message: 'Request body is empty or invalid. Expecting ReceiptData JSON.',
    });
  }

  // Minimal sanity check (customize as needed)
  if (!payload.totalAmount && !payload.kdvAmount && !payload.businessName) {
    return res.status(400).json({
      status: 'error',
      message: 'Missing key fields (e.g., businessName or amounts).',
    });
  }

  const result = await writeReceiptToS3WithMonthlySheets(userId, fullname, payload);
  return res.status(result.status === 'success' ? 200 : 500).json(result);
});

/**
 * GET /excel/files
 * List the (single) Excel file for the current user.
 */
router.get("/files", auditInterceptor("LIST_EXCEL"), async (req, res) => {
  try {
    const { userId, fullname } = await JwtUtil.extractUser(req);  const payload = req.body as ReceiptData | undefined;
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
 * GET /excel/files/:id/presign
 * Get a fresh pre-signed GET URL (id = _id or s3Key).
 */
router.get("/files/:id/presign", async (req, res) => {
  try {
    const { userId, fullname } = await JwtUtil.extractUser(req);  const payload = req.body as ReceiptData | undefined;
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