import { Router } from "express";
import { insertReadNotifications, listNotifications } from "../controllers/notificationController";
import { auditInterceptor } from "../middleware/auditInterceptor";

const router = Router();

router.get("/", auditInterceptor("NOTIFICATION_LIST"), listNotifications);
router.post("/read", auditInterceptor("NOTIFICATION_READ_INSERT"), insertReadNotifications);

export default router;
