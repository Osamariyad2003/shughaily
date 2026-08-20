import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import {
  getAutoApplySettingsController,
  updateAutoApplySettingsController,
} from '../controllers/autoApply.controller';
import { updateAutoApplySettingsSchema } from '../validators/autoApply.validator';

const router = Router();

router.use(authenticate as never);

router.get('/settings', getAutoApplySettingsController);
router.patch('/settings', validate(updateAutoApplySettingsSchema), updateAutoApplySettingsController);

export default router;
