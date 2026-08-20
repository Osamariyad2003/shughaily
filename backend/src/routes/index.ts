import { Router } from 'express';
import authRoutes from './auth.routes';
import usersRoutes from './users.routes';
import resumesRoutes from './resumes.routes';
import jobsRoutes from './jobs.routes';
import applicationsRoutes from './applications.routes';
import copilotRoutes from './copilot.routes';
import dashboardRoutes from './dashboard.routes';
import searchAgentsRoutes from './searchAgents.routes';
import apiKeysRoutes from './apiKeys.routes';
import billingRoutes from './billing.routes';
import autoApplyRoutes from './autoApply.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/resumes', resumesRoutes);
router.use('/jobs', jobsRoutes);
router.use('/applications', applicationsRoutes);
router.use('/copilot', copilotRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/search-agents', searchAgentsRoutes);
router.use('/keys', apiKeysRoutes);
router.use('/dashboard/billing', billingRoutes);
router.use('/auto-apply', autoApplyRoutes);

export default router;
