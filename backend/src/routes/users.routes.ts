import { Router } from 'express';
import {
  getProfile,
  updateProfile,
  getPreferences,
  updatePreferences,
} from '../controllers/users.controller';
import { authenticate } from '../middlewares/auth';

const router = Router();

// All user routes require authentication
router.use(authenticate as never);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.get('/preferences', getPreferences);
router.put('/preferences', updatePreferences);

export default router;
