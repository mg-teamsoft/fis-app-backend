import { Router, Request, Response } from "express";
import { ReceiptData } from "../types/receiptTypes";
import { writeReceiptToS3WithMonthlySheets } from "../services/excelWriterWithExcelJs";
import { validateByUserId } from "../utils/rulesValidator";
import { auditInterceptor } from "../middleware/auditInterceptor";
import { JwtUtil } from "../utils/jwtUtil";
import { saveAndUploadExcel } from "../services/excelWriterService";

const router = Router();

/**
 * POST /excel/template/write
 * Body: { userId: string, receipt: ReceiptData, fullName?: string }
 */
router.post("/write", auditInterceptor("TEMPLATE_WRITE"), async (req: Request, res: Response) => {
  try {
    const { userId, fullname } = await JwtUtil.extractUser(req);
    const receipt = req.body as ReceiptData | undefined;

    if (!userId) {
      res.locals.auditMessage = "Missing userId";
      return res.status(400).json({ status: "error", message: "Missing userId" });
    }
    if (!receipt) {
      res.locals.auditMessage = "Missing receipt";
      return res.status(400).json({ status: "error", message: "Missing receipt" });
    }

    // 1) Validate against user rules
    const check = await validateByUserId(userId, receipt);
    if (!check.ok) {
      res.locals.auditMessage = check.reason;
      res.locals.auditPayload = { userId, ruleViolation: check.reason, preview: {
        businessName: receipt.businessName,
        transactionDate: receipt.transactionDate,
        totalAmount: receipt.totalAmount,
        transactionType: receipt.transactionType?.type ?? null,
      }};
      return res.status(200).json({
        status: "error",
        message: check.reason
      });
    }

    // 2) If ok, write to Excel
    const result = await writeReceiptToS3WithMonthlySheets(userId, fullname, receipt);

    if (!result.filePath) {
      res.locals.auditMessage = "Workbook generation failed";
      return res.status(500).json({ status: "error", message: "Workbook generation failed" });
    }

    const { key, url } = await saveAndUploadExcel({
      workbook: null,
      userId: userId,
      fullName: fullname,
      localOutDir: "output",   // optional local copy
      presignTtlSec: 900,
      useSSE: false,           // set true if bucket policy requires
    });

    res.locals.auditMessage = result.message;
    res.locals.auditPayload = { userId, wrote: true, sheet: result.sheet, row: result.row, s3: { key, url, ttlSec: 900 }, };
    return res.status(result.status === "success" ? 200 : 500).json(result);
  } catch (err: any) {
    res.locals.auditMessage = err?.message || "Write failed";
    return res.status(500).json({ status: "error", message: res.locals.auditMessage });
  }
});

export default router;