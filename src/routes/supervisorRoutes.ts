import { Router } from "express";
import { requireSupervisorAccess } from "../middleware/requireSupervisorAccess";
import { supervisorListCustomers, supervisorListCustomerReceipts, supervisorGetReceiptDetail, supervisorDownloadExcel } from "../controllers/supervisorController";

const router = Router();

router.get("/customers", supervisorListCustomers);

// 4.1 list receipts
router.post(
  "/customers/receipts",
  requireSupervisorAccess("customerUserId", "VIEW_RECEIPTS"),
  supervisorListCustomerReceipts
);

// 4.2 receipt detail (includes image url)
router.post(
  "/customers/receipts/:receiptId",
  requireSupervisorAccess("customerUserId", "VIEW_RECEIPTS"),
  supervisorGetReceiptDetail
);

// 4.3 excel download (redirect to presigned URL)
router.post(
  "/customers/excel",
  requireSupervisorAccess("customerUserId", "DOWNLOAD_FILES"),
  supervisorDownloadExcel
);

export default router;
