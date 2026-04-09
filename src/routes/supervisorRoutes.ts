import { Router } from "express";
import { requireSupervisorAccess } from "../middleware/requireSupervisorAccess";
import { supervisorListCustomers, supervisorListCustomerReceipts, supervisorGetReceiptDetail, supervisorListExcelFiles, supervisorDownloadExcel } from "../controllers/supervisorController";

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

// 4.3 excel download (get excel file list, then frontend will call presigned URL API for the selected file)
router.post(
  "/customers/excel/files",
  requireSupervisorAccess("customerUserId", "DOWNLOAD_FILES"),
  supervisorListExcelFiles
);

// 4.4 excel download (get presigned URL for the selected file)
router.post(
  "/customers/excel/files/:fileId/presign",
  requireSupervisorAccess("customerUserId", "DOWNLOAD_FILES"),
  supervisorDownloadExcel
);

export default router;
