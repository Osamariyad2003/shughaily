import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { getBillingStats } from '../controllers/billing.controller';

const router = Router();

router.use(authenticate);
router.get('/', getBillingStats);

export default router;
