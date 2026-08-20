import { Router } from 'express';
import { register, login, getMe, googleAuth } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { loginRateLimiter, registerRateLimiter } from '../middlewares/rateLimit';
import { registerSchema, loginSchema } from '../validators/auth.validator';

const router = Router();

router.post('/register', registerRateLimiter, validate(registerSchema), register);
router.post('/login', loginRateLimiter, validate(loginSchema), login);
router.post('/google', registerRateLimiter, googleAuth);
router.get('/me', authenticate as never, getMe);

export default router;
