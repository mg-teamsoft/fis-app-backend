import { Router } from "express";
import { insertReadNotifications, listNotifications, createExcelUpdateNotification } from "../controllers/notificationController";
import { auditInterceptor } from "../middleware/auditInterceptor";

const router = Router();

router.get("/", auditInterceptor("NOTIFICATION_LIST"), listNotifications);
router.post("/read", auditInterceptor("NOTIFICATION_READ_INSERT"), insertReadNotifications);
router.post("/excelUpdate", auditInterceptor("NOTIFICATION_EXCEL_UPDATE"), createExcelUpdateNotification);

export default router;
