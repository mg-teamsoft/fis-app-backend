import { Router } from "express";
import { acceptInvite, createContactInvite, getPendingInvites, listMyCreatedInvites, listMyCustomers, listMySupervisors, rejectInvite, resendContactInvite, revokeLink } from "../controllers/contactController";
import { auditInterceptor } from "../middleware/auditInterceptor";

const router = Router();

// supervisor actions
router.post("/invites/:id/reject", rejectInvite);          // 3.4
router.get("/customers", listMyCustomers);                 // 3.6
router.get("/invites/pending", getPendingInvites);
router.post("/invites/:id/accept", acceptInvite);

// customer actions
router.get("/invites", listMyCreatedInvites);
router.get("/supervisors", listMySupervisors);             // 3.5
router.post("/invites", auditInterceptor("CONTACT_INVITE_CREATE"), createContactInvite);
router.post("/invites/:id/resend", resendContactInvite);
router.post("/links/:id/revoke", revokeLink);

export default router;
