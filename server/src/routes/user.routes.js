import { Router } from 'express';
import {
  getUsers,
  createUser,
  updateUser,
  resetUserPassword,
} from '../controllers/user.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

// All user management routes are strictly restricted to authenticated Administrators
router.use(authenticate, authorize('ADMIN'));

router.get('/', getUsers);
router.post('/', createUser);
router.patch('/:id', updateUser);
router.post('/:id/reset-password', resetUserPassword);

export default router;
