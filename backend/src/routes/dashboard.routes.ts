import { Router } from 'express';
import { getStats, getRecentActivity } from '../controllers/dashboard.controller';
import { authenticate } from '../middlewares/auth';

const router = Router();

// All dashboard routes require authentication
router.use(authenticate as never);

router.get('/stats', getStats);
router.get('/recent-activity', getRecentActivity);

export default router;
