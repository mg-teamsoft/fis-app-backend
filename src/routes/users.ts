import { Router } from 'express';
import { auditInterceptor } from '../middleware/auditInterceptor';
import {
  createUser,
  deleteUser,
  getUser,
  listUsers,
  updateUser,
} from '../controllers/userController';

const router = Router();

router.get('/list', auditInterceptor('USER_LIST'), listUsers);
router.get('/', auditInterceptor('USER_GET'), getUser);
router.post('/', auditInterceptor('USER_CREATE'), createUser);
router.put('/', auditInterceptor('USER_UPDATE'), updateUser);
router.delete('/', auditInterceptor('USER_DELETE'), deleteUser);

export default router;
