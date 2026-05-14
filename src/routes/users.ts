import { Router } from 'express';
import { auditInterceptor } from '../middleware/auditInterceptor';
import {
  createUser,
  deleteUser,
  getUser,
  getUserDeletionStatus,
  listUsers,
  updateUser,
} from '../controllers/userController';

const router = Router();
export const publicUserRoutes = Router();

publicUserRoutes.get('/deletion-status/:jobId', getUserDeletionStatus);

router.get('/list', auditInterceptor('USER_LIST'), listUsers);
router.get('/', auditInterceptor('USER_GET'), getUser);
router.post('/', auditInterceptor('USER_CREATE'), createUser);
router.put('/', auditInterceptor('USER_UPDATE'), updateUser);
router.delete('/', auditInterceptor('USER_DELETE'), deleteUser);

export default router;
