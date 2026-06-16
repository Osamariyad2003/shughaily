import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import {
  createSearchAgentController,
  deleteSearchAgentController,
  getCandidateProfileSummaryController,
  getSearchAgentQueryPlanController,
  getSearchAgents,
  runSearchAgentController,
  updateSearchAgentController,
} from '../controllers/searchAgents.controller';
import {
  createSearchAgentSchema,
  searchAgentIdSchema,
  updateSearchAgentSchema,
} from '../validators/searchAgents.validator';

const router = Router();

router.use(authenticate as never);

router.get('/', getSearchAgents);
router.get('/candidate-profile', getCandidateProfileSummaryController);
router.get('/:id/query-plan', validate(searchAgentIdSchema, 'params'), getSearchAgentQueryPlanController);
router.post('/', validate(createSearchAgentSchema), createSearchAgentController);
router.post('/:id/run', validate(searchAgentIdSchema, 'params'), runSearchAgentController);
router.patch('/:id', validate(searchAgentIdSchema, 'params'), validate(updateSearchAgentSchema), updateSearchAgentController);
router.delete('/:id', validate(searchAgentIdSchema, 'params'), deleteSearchAgentController);

export default router;
