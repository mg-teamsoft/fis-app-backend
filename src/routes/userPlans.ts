import { Router } from 'express';
import { auditInterceptor } from '../middleware/auditInterceptor';
import {
  getPlansForUser,
  getUserPlan,
  getUserPlanDetails,
  listUserPlans,
  updateUserPlan,
} from '../controllers/userPlanController';

const router = Router();

router.get('/', auditInterceptor('USER_PLAN_LIST'), listUserPlans);
router.get('/user', auditInterceptor('USER_PLAN_BY_USER'), getPlansForUser);
router.get('/:id', auditInterceptor('USER_PLAN_GET'), getUserPlan);
router.put('/:id', auditInterceptor('USER_PLAN_UPDATE'), updateUserPlan);
router.get('/:id/details', auditInterceptor('USER_PLAN_DETAILS'), getUserPlanDetails);

export default router;
