import { Router } from 'express';
import {
  applyPack,
  atsCheck,
  atsReview,
  autoApplyDecision,
  chat,
  cvFeedback,
  generateApplicationEmail,
  generateCoverLetter,
  generateFormAnswers,
  generateInterviewAnswer,
  interviewPrep,
  matchJob,
} from '../controllers/copilot.controller';
import { authenticate } from '../middlewares/auth';

const router = Router();

// All copilot routes require authentication
router.use(authenticate as never);

router.post('/chat', chat);
router.post('/cv-feedback', cvFeedback);
router.post('/cover-letter', generateCoverLetter);
router.post('/application-email', generateApplicationEmail);
router.post('/form-answers', generateFormAnswers);
router.post('/interview-answer', generateInterviewAnswer);
router.post('/interview-prep', interviewPrep);
router.post('/match-job', matchJob);
router.post('/ats-check', atsCheck);
router.post('/ats-review', atsReview);
router.post('/auto-apply-decision', autoApplyDecision);
router.post('/apply-pack', applyPack);

export default router;
