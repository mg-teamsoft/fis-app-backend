import { Router } from "express";
import { requireSupervisorAccess } from "../middleware/requireSupervisorAccess";
import { supervisorListCustomerReceipts, supervisorGetReceiptDetail, supervisorDownloadExcel } from "../controllers/supervisorController";

const router = Router();

// 4.1 list receipts
router.get(
  "/customers/:customerUserId/receipts",
  requireSupervisorAccess("customerUserId", "VIEW_RECEIPTS"),
  supervisorListCustomerReceipts
);

// 4.2 receipt detail (includes image url)
router.get(
  "/customers/:customerUserId/receipts/:receiptId",
  requireSupervisorAccess("customerUserId", "VIEW_RECEIPTS"),
  supervisorGetReceiptDetail
);

// 4.3 excel download (redirect to presigned URL)
router.get(
  "/customers/:customerUserId/excel",
  requireSupervisorAccess("customerUserId", "DOWNLOAD_FILES"),
  supervisorDownloadExcel
);

export default router;