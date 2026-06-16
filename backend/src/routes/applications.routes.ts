import { Router } from 'express';
import {
  getApplications,
  createApplication,
  updateApplication,
  deleteApplication,
} from '../controllers/applications.controller';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import {
  createApplicationSchema,
  updateApplicationSchema,
  applicationIdSchema,
  applicationsQuerySchema,
} from '../validators/applications.validator';

const router = Router();

// All application routes require authentication
router.use(authenticate as never);

router.get('/', validate(applicationsQuerySchema, 'query'), getApplications);
router.post('/', validate(createApplicationSchema), createApplication);
router.put('/:id', validate(applicationIdSchema, 'params'), validate(updateApplicationSchema), updateApplication);
router.delete('/:id', validate(applicationIdSchema, 'params'), deleteApplication);

export default router;
