import { Router } from "express";
import { acceptInvite, acceptInvitePublic, createContactInvite, deleteMySupervisor, getPendingInvites, listMyCreatedInvites, listMyCustomers, listMySupervisors, rejectInvite, rejectInvitePublic, resendContactInvite, revokeLink } from "../controllers/contactController";
import { auditInterceptor } from "../middleware/auditInterceptor";

const publicRouter = Router();
const router = Router();

// public token-based invite actions
publicRouter.post("/invites/accept", acceptInvitePublic);
publicRouter.post("/invites/reject", rejectInvitePublic);

// supervisor actions
router.post("/invites/:id/reject", rejectInvite);          // 3.4
router.get("/customers", listMyCustomers);                 // 3.6
router.get("/invites/pending", getPendingInvites);
router.post("/invites/:id/accept", acceptInvite);

// customer actions
router.get("/invites", listMyCreatedInvites);
router.get("/supervisors", listMySupervisors);             // 3.5
router.delete("/supervisors/:id", deleteMySupervisor);
router.post("/invites", auditInterceptor("CONTACT_INVITE_CREATE"), createContactInvite);
router.post("/invites/:id/resend", resendContactInvite);
router.post("/links/:id/revoke", revokeLink);

export const publicContactRoutes = publicRouter;
export default router;
