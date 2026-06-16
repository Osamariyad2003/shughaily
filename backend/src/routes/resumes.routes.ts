import { Router } from 'express';
import multer from 'multer';
import {
  uploadResume,
  getResumes,
  getResume,
  deleteResume,
  parseResume,
  updateSkills,
} from '../controllers/resumes.controller';
import { authenticate } from '../middlewares/auth';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const router = Router();

// All resume routes require authentication
router.use(authenticate as never);

router.post('/upload', upload.single('file'), uploadResume);
router.get('/', getResumes);
router.get('/:id', getResume);
router.delete('/:id', deleteResume);
router.post('/:id/parse', parseResume);
router.patch('/:id/skills', updateSkills);

export default router;
