import { Router } from 'express';
import {
  createPlan,
  deletePlan,
  getPlanById,
  listPlans,
  updatePlan,
} from '../controllers/planController';
import { auditInterceptor } from '../middleware/auditInterceptor';

const publicRouter = Router();
publicRouter.get('/', listPlans);

const router = Router();
router.get('/:id', auditInterceptor('PLAN_GET'), getPlanById);
router.post('/', auditInterceptor('PLAN_WRITE'), createPlan);
router.put('/:id', auditInterceptor('PLAN_UPDATE'), updatePlan);
router.delete('/:id', auditInterceptor('PLAN_DELETE'), deletePlan);

export const publicPlanRoutes = publicRouter;
export default router;
