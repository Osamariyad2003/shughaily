import { Router } from 'express';
import {
  getJobs,
  getJob,
  getRecommendedJobs,
  getSavedJobs,
  saveJob,
  unsaveJob,
  searchExternal,
} from '../controllers/jobs.controller';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { jobsQuerySchema, jobIdSchema } from '../validators/jobs.validator';

const router = Router();

// Recommended jobs require auth
router.get('/recommended', authenticate as never, getRecommendedJobs);
router.get('/saved', authenticate as never, getSavedJobs);
router.post('/saved', authenticate as never, saveJob);
router.delete('/saved/:jobId', authenticate as never, unsaveJob);

// Public routes
router.get('/search', authenticate as never, searchExternal);
router.get('/', validate(jobsQuerySchema, 'query'), getJobs);
router.get('/:id', validate(jobIdSchema, 'params'), getJob);

export default router;
