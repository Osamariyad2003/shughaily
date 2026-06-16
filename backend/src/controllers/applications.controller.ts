import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { query } from '../config/database';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../middlewares/errorHandler';
import { AuthRequest, Application } from '../types';

export const getApplications = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);

  const { page = '1', limit = '20', status } = req.query as Record<string, string | undefined>;
  const pageNum = Math.max(1, parseInt(page ?? '1', 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10)));
  const offset = (pageNum - 1) * limitNum;

  const conditions = ['a.user_id = $1'];
  const params: unknown[] = [authReq.user.id];
  let paramIndex = 2;

  if (status) {
    conditions.push(`a.status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM applications a ${whereClause}`,
    params,
  );

  const rows = await query<
    Application & {
      job_title?: string;
      company?: string;
    }
  >(
    `SELECT
       a.*,
       j.title as job_title,
       j.company,
       j.location,
       j.apply_url
     FROM applications a
     LEFT JOIN jobs j ON j.id = a.job_id
     ${whereClause}
     ORDER BY COALESCE(a.applied_at, a.updated_at) DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limitNum, offset],
  );

  const total = parseInt(countResult[0]?.count ?? '0', 10);
  res.json({
    success: true,
    data: rows,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      total_pages: Math.max(1, Math.ceil(total / limitNum)),
    },
  });
});

export const createApplication = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);

  const { job_id, status = 'applied', notes } = req.body;

  const existing = await query<Pick<Application, 'id'>>(
    'SELECT id FROM applications WHERE user_id = $1 AND job_id = $2 AND status != $3',
    [authReq.user.id, job_id, 'withdrawn'],
  );

  if (existing.length > 0) {
    throw new AppError('You already have an application for this job.', 409);
  }

  const jobCheck = await query<{ id: string }>('SELECT id FROM jobs WHERE id = $1', [job_id]);
  if (jobCheck.length === 0) {
    throw new AppError('Job not found.', 404);
  }

  const id = randomUUID();
  const now = new Date();
  const appliedAt = status === 'saved' ? null : now;

  const rows = await query<Application>(
    `INSERT INTO applications (id, user_id, job_id, status, notes, applied_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, user_id, job_id, status, notes, applied_at, updated_at`,
    [id, authReq.user.id, job_id, status, notes ?? null, appliedAt, now],
  );

  res.status(201).json({ success: true, data: rows[0] });
});

export const updateApplication = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);

  const { status, notes } = req.body;

  const rows = await query<Application>(
    `UPDATE applications
     SET status = COALESCE($1, status),
         notes = COALESCE($2, notes),
         applied_at = CASE
           WHEN $1 IS NOT NULL AND $1 != 'saved' AND applied_at IS NULL THEN NOW()
           ELSE applied_at
         END,
         updated_at = NOW()
     WHERE id = $3 AND user_id = $4
     RETURNING id, user_id, job_id, status, notes, applied_at, updated_at`,
    [status ?? null, notes ?? null, req.params.id, authReq.user.id],
  );

  if (rows.length === 0) {
    throw new AppError('Application not found.', 404);
  }

  res.json({ success: true, data: rows[0] });
});

export const deleteApplication = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);

  const rows = await query<{ id: string }>(
    'DELETE FROM applications WHERE id = $1 AND user_id = $2 RETURNING id',
    [req.params.id, authReq.user.id],
  );

  if (rows.length === 0) {
    throw new AppError('Application not found.', 404);
  }

  res.json({ success: true, message: 'Application deleted successfully.' });
});
