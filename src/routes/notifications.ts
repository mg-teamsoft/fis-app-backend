import { requireAuth } from "../middleware/authJwt";
import { requireNotificationToken } from "../middleware/requireNotificationToken";
import { createAnnouncement } from "../controllers/createAnnouncement";
import { Router } from "express";
import { insertReadNotifications, listNotifications, createExcelUpdateNotification } from "../controllers/notificationController";
import { auditInterceptor } from "../middleware/auditInterceptor";

const router = Router();

router.post("/", requireNotificationToken, createAnnouncement);

router.use(requireAuth());

router.get("/", auditInterceptor("NOTIFICATION_LIST"), listNotifications);
router.post("/read", auditInterceptor("NOTIFICATION_READ_INSERT"), insertReadNotifications);
router.post("/excelUpdate", auditInterceptor("NOTIFICATION_EXCEL_UPDATE"), createExcelUpdateNotification);

export default router;
