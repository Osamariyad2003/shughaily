import path from 'path';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { query } from '../config/database';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../middlewares/errorHandler';
import { storageService } from '../services/storage.service';
import { aiService } from '../services/ai.service';
import { AuthRequest, ParsedResumeData, Resume } from '../types';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function inferFileType(fileName?: string | null): string {
  const ext = path.extname(fileName ?? '').replace('.', '').toLowerCase();
  if (ext === 'doc') return 'docx';
  return ext || 'pdf';
}

export const uploadResume = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);

  const file = req.file;
  if (!file) {
    throw new AppError('No file uploaded. Please attach a resume file.', 400);
  }

  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    throw new AppError('Invalid file type. Only PDF and Word documents are accepted.', 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new AppError('File too large. Maximum size is 10 MB.', 400);
  }

  const { url } = await storageService.upload(
    file.buffer,
    file.originalname,
    file.mimetype,
    `resumes/${authReq.user.id}`,
  );

  const id = randomUUID();
  const rows = await query<Resume>(
    `INSERT INTO resumes (id, user_id, file_name, file_url)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, file_name, file_url, raw_text, parsed_data, created_at`,
    [id, authReq.user.id, file.originalname, url],
  );

  res.status(201).json({ success: true, data: rows[0] });
});

export const getResumes = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);

  const rows = await query<Resume>(
    `SELECT id, user_id, file_name, file_url, raw_text, parsed_data, created_at
     FROM resumes
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [authReq.user.id],
  );

  res.json({ success: true, data: rows });
});

export const getResume = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);

  const rows = await query<Resume>(
    `SELECT id, user_id, file_name, file_url, raw_text, parsed_data, created_at
     FROM resumes
     WHERE id = $1 AND user_id = $2`,
    [req.params.id, authReq.user.id],
  );

  if (rows.length === 0) {
    throw new AppError('Resume not found.', 404);
  }

  res.json({ success: true, data: rows[0] });
});

export const deleteResume = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);

  const rows = await query<Resume>(
    'SELECT id, user_id, file_name, file_url, raw_text, parsed_data, created_at FROM resumes WHERE id = $1 AND user_id = $2',
    [req.params.id, authReq.user.id],
  );

  if (rows.length === 0) {
    throw new AppError('Resume not found.', 404);
  }

  if (rows[0].file_url) {
    try {
      await storageService.delete(rows[0].file_url);
    } catch (err) {
      console.error('Failed to delete file from storage:', err);
    }
  }

  await query('DELETE FROM resumes WHERE id = $1', [req.params.id]);
  res.json({ success: true, message: 'Resume deleted successfully.' });
});

export const updateSkills = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);

  const { skills } = req.body as { skills: string[] };
  if (!Array.isArray(skills)) throw new AppError('skills must be an array.', 400);

  const normalized = [...new Set(skills.map((s) => String(s).trim()).filter(Boolean))];

  // Fetch existing parsed_data and merge skills into it
  const existing = await query<Resume>(
    'SELECT id, user_id, parsed_data FROM resumes WHERE id = $1 AND user_id = $2',
    [req.params.id, authReq.user.id],
  );
  if (existing.length === 0) throw new AppError('Resume not found.', 404);

  const base = (existing[0].parsed_data && typeof existing[0].parsed_data === 'object')
    ? (existing[0].parsed_data as unknown as Record<string, unknown>)
    : {};

  const merged = { ...base, skills: normalized };

  const updated = await query<Resume>(
    `UPDATE resumes SET parsed_data = $1::jsonb WHERE id = $2 AND user_id = $3
     RETURNING id, user_id, file_name, file_url, raw_text, parsed_data, created_at`,
    [JSON.stringify(merged), req.params.id, authReq.user.id],
  );

  res.json({ success: true, data: updated[0] });
});

export const parseResume = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);

  const rows = await query<Resume>(
    `SELECT id, user_id, file_name, file_url, raw_text, parsed_data, created_at
     FROM resumes
     WHERE id = $1 AND user_id = $2`,
    [req.params.id, authReq.user.id],
  );

  if (rows.length === 0) {
    throw new AppError('Resume not found.', 404);
  }

  const resume = rows[0];
  const fileUrl = resume.file_url ? await storageService.getSignedUrl(resume.file_url).catch(() => resume.file_url ?? '') : '';
  const fileType = inferFileType(resume.file_name);

  const parsedData = (await aiService.parseResume(fileUrl, fileType)) as unknown as ParsedResumeData;

  const updated = await query<Resume>(
    `UPDATE resumes
     SET raw_text = $1,
         parsed_data = $2::jsonb
     WHERE id = $3
     RETURNING id, user_id, file_name, file_url, raw_text, parsed_data, created_at`,
    [parsedData.raw_text ?? null, JSON.stringify(parsedData), resume.id],
  );

  res.json({ success: true, data: updated[0] });
});
