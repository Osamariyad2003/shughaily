import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { query } from '../config/database';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../middlewares/errorHandler';
import { aiService } from '../services/ai.service';
import { jobSearchService } from '../services/jobSearch.service';
import { AuthRequest, Job, Match, Resume } from '../types';

export const getJobs = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const {
    page = 1,
    limit = 20,
    search,
    location,
    work_type,
    sort_by = 'created_at',
    sort_order = 'desc',
  } = req.query as Record<string, string | undefined>;

  const pageNum = Math.max(1, parseInt(String(page ?? '1'), 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(String(limit ?? '20'), 10)));
  const offset = (pageNum - 1) * limitNum;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (search) {
    conditions.push(
      `(title ILIKE $${paramIndex} OR company ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`,
    );
    params.push(`%${search}%`);
    paramIndex++;
  }

  if (location) {
    conditions.push(`location ILIKE $${paramIndex}`);
    params.push(`%${location}%`);
    paramIndex++;
  }

  if (work_type) {
    conditions.push(`employment_type = $${paramIndex}`);
    params.push(work_type);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const allowedSorts = ['created_at', 'title'];
  const safeSort = allowedSorts.includes(sort_by ?? '') ? sort_by : 'created_at';
  const safeOrder = sort_order === 'asc' ? 'ASC' : 'DESC';

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM jobs ${whereClause}`,
    params,
  );

  const jobs = await query<Job>(
    `SELECT id, source, external_id, title, normalized_title, company, location, description, salary_text, employment_type, created_at
     FROM jobs
     ${whereClause}
     ORDER BY ${safeSort} ${safeOrder}
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limitNum, offset],
  );

  const total = parseInt(countResult[0]?.count ?? '0', 10);
  res.json({
    success: true,
    data: jobs,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      total_pages: Math.max(1, Math.ceil(total / limitNum)),
    },
  });
});

export const getJob = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const rows = await query<Job>(
    `SELECT id, source, external_id, title, normalized_title, company, location, description, salary_text, employment_type, apply_url, employer_logo, created_at
     FROM jobs
     WHERE id = $1`,
    [req.params.id],
  );

  if (rows.length === 0) {
    throw new AppError('Job not found.', 404);
  }

  res.json({ success: true, data: rows[0] });
});

export const getRecommendedJobs = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);

  const resumes = await query<Resume>(
    `SELECT id, user_id, file_name, file_url, raw_text, parsed_data, created_at
     FROM resumes
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [authReq.user.id],
  );

  if (resumes.length === 0) {
    const jobs = await query<Job>(
      `SELECT id, source, external_id, title, normalized_title, company, location, description, salary_text, employment_type, created_at
       FROM jobs
       ORDER BY created_at DESC
       LIMIT 20`,
    );
    res.json({
      success: true,
      data: [],
      message: 'Upload a resume for personalized recommendations.',
      fallback_jobs: jobs,
    });
    return;
  }

  try {
    const result = await aiService.matchJobs(authReq.user.id, resumes[0].id);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('AI match service error, falling back to cached matches:', err);
    const matches = await query<Match & Job>(
      `SELECT
         m.id,
         m.user_id,
         m.job_id,
         m.score,
         m.explanation_ar,
         m.created_at,
         j.source,
         j.external_id,
         j.title,
         j.normalized_title,
         j.company,
         j.location,
         j.description,
         j.salary_text,
         j.employment_type
       FROM matches m
       JOIN jobs j ON j.id = m.job_id
       WHERE m.user_id = $1
       ORDER BY m.created_at DESC
       LIMIT 20`,
      [authReq.user.id],
    );

    res.json({ success: true, data: { matches }, message: 'Showing the latest saved recommendations.' });
  }
});

export const getSavedJobs = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);

  const rows = await query<Job>(
    `SELECT
       j.id,
       j.source,
       j.external_id,
       j.title,
       j.normalized_title,
       j.company,
       j.location,
       j.description,
       j.salary_text,
       j.employment_type,
       j.created_at
     FROM saved_jobs s
     JOIN jobs j ON j.id = s.job_id
     WHERE s.user_id = $1
     ORDER BY s.created_at DESC`,
    [authReq.user.id],
  );

  res.json({ success: true, data: rows });
});

export const saveJob = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);

  const { job_id } = req.body;
  if (!job_id) {
    throw new AppError('job_id is required.', 400);
  }

  const jobs = await query<Pick<Job, 'id'>>('SELECT id FROM jobs WHERE id = $1', [job_id]);
  if (jobs.length === 0) {
    throw new AppError('Job not found.', 404);
  }

  const rows = await query(
    `INSERT INTO saved_jobs (id, user_id, job_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, job_id) DO NOTHING
     RETURNING id, user_id, job_id, created_at`,
    [randomUUID(), authReq.user.id, job_id],
  );

  res.status(rows.length > 0 ? 201 : 200).json({
    success: true,
    message: rows.length > 0 ? 'Job saved successfully.' : 'Job was already saved.',
  });
});

export const searchExternal = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { q, location, page, remote, employment_type } = req.query as Record<string, string | undefined>;

  if (!q || !q.trim()) {
    throw new AppError('Search query (q) is required.', 400);
  }

  const EMPLOYMENT_TYPE_REVERSE: Record<string, string> = {
    'دوام كامل': 'FULLTIME',
    'دوام جزئي': 'PARTTIME',
    'عقد': 'CONTRACTOR',
    'عن بعد': 'FULLTIME',
  };

  const authReq = req as AuthRequest;
  let searchApiKey: string | undefined;
  if (authReq.user) {
    const userRows = await query<{ search_api_key?: string | null }>(
      `SELECT search_api_key FROM users WHERE id = $1`,
      [authReq.user.id],
    );
    searchApiKey = userRows[0]?.search_api_key ?? undefined;
  }

  const result = await jobSearchService.search({
    query: q.trim(),
    location: location?.trim() || undefined,
    page: parseInt(page ?? '1', 10),
    remoteOnly: remote === 'true' || employment_type === 'عن بعد',
    employmentType: employment_type ? EMPLOYMENT_TYPE_REVERSE[employment_type] : undefined,
    apiKey: searchApiKey,
  });

  res.json({
    success: true,
    data: result.jobs,
    total: result.total,
  });
});

export const unsaveJob = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);

  const rows = await query(
    'DELETE FROM saved_jobs WHERE user_id = $1 AND job_id = $2 RETURNING id',
    [authReq.user.id, req.params.jobId],
  );

  if (rows.length === 0) {
    throw new AppError('Saved job not found.', 404);
  }

  res.json({ success: true, message: 'Saved job removed.' });
});
