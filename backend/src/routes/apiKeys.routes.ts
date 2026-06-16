import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { createApiKey, listApiKeys, revokeApiKey } from '../controllers/apiKeys.controller';

const router = Router();

router.use(authenticate);

router.post('/', createApiKey);
router.get('/', listApiKeys);
router.delete('/:id', revokeApiKey);

export default router;
