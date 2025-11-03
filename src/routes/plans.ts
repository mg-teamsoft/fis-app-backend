import { Router, Request, Response } from 'express';
import {
    createPlan,
    deletePlan,
    getPlanById,
    listPlans,
    updatePlan,
    purchasePlan
} from '../controllers/planController';
import { auditInterceptor } from '../middleware/auditInterceptor';
import { JwtUtil } from '../utils/jwtUtil';

const publicRouter = Router();
publicRouter.get('/', listPlans);

const router = Router();

router.get('/:id', auditInterceptor("PLAN_GET"), getPlanById);
publicRouter.post('/', createPlan);
router.put('/:id', auditInterceptor("PLAN_UPDATE"), updatePlan);
router.delete('/:id', auditInterceptor("PLAN_DELETE"), deletePlan);

router.post('/purchase', auditInterceptor("PLAN_PURCHASE"), async (req: Request, res: Response) => {
    try {
        const { userId } = await JwtUtil.extractUser(req);
        const { planKey } = req.body;
        await purchasePlan(userId, planKey);

        res.status(200).json({ message: 'Plan başarıyla tanımlandı.' });
    } catch (error: any) {
        return res.status(500).json({ message: 'Plan satın alma işlemi başarısız.', error: error.message });
    }
});

export const publicPlanRoutes = publicRouter;
export default router;
