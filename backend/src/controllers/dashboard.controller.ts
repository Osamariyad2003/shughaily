import { Request, Response } from 'express';
import { query } from '../config/database';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../middlewares/errorHandler';
import { AuthRequest } from '../types';

export const getStats = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);

  const userId = authReq.user.id;

  const [applicationsResult, savedJobsResult, recommendationsResult, profileResult, prefsResult, resumeResult] =
    await Promise.all([
      query<{ count: string }>('SELECT COUNT(*) as count FROM applications WHERE user_id = $1', [userId]),
      query<{ count: string }>('SELECT COUNT(*) as count FROM saved_jobs WHERE user_id = $1', [userId]),
      query<{ count: string }>('SELECT COUNT(*) as count FROM matches WHERE user_id = $1', [userId]),
      query<{ name: string | null; country: string | null; city: string | null }>(
        'SELECT name, country, city FROM users WHERE id = $1',
        [userId],
      ),
      query<{ target_titles: string[] | null; preferred_locations: string[] | null; work_type: string | null }>(
        'SELECT target_titles, preferred_locations, work_type FROM user_preferences WHERE user_id = $1',
        [userId],
      ),
      query<{ count: string }>('SELECT COUNT(*) as count FROM resumes WHERE user_id = $1', [userId]),
    ]);

  const profile = profileResult[0];
  const preferences = prefsResult[0];
  const resumeCount = parseInt(resumeResult[0]?.count ?? '0', 10);
  const completionChecks = [
    Boolean(profile?.name),
    Boolean(profile?.country),
    Boolean(profile?.city),
    Boolean(preferences?.target_titles?.length),
    Boolean(preferences?.preferred_locations?.length),
    Boolean(preferences?.work_type),
    resumeCount > 0,
  ];
  const profileCompletion = Math.round(
    (completionChecks.filter(Boolean).length / completionChecks.length) * 100,
  );

  res.json({
    success: true,
    data: {
      recommendations_count: parseInt(recommendationsResult[0]?.count ?? '0', 10),
      applications_count: parseInt(applicationsResult[0]?.count ?? '0', 10),
      saved_jobs_count: parseInt(savedJobsResult[0]?.count ?? '0', 10),
      profile_completion: profileCompletion,
    },
  });
});

export const getRecentActivity = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);

  const userId = authReq.user.id;
  const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) ?? '10', 10)));

  const activities = await query<{
    type: string;
    title: string;
    timestamp: Date;
  }>(
    `(
      SELECT
        'application' as type,
        COALESCE(j.title, 'Job application') as title,
        COALESCE(a.applied_at, a.updated_at) as timestamp
      FROM applications a
      LEFT JOIN jobs j ON j.id = a.job_id
      WHERE a.user_id = $1
    )
    UNION ALL
    (
      SELECT
        'resume' as type,
        COALESCE(r.file_name, 'Resume upload') as title,
        r.created_at as timestamp
      FROM resumes r
      WHERE r.user_id = $1
    )
    UNION ALL
    (
      SELECT
        'saved_job' as type,
        COALESCE(j.title, 'Saved job') as title,
        s.created_at as timestamp
      FROM saved_jobs s
      LEFT JOIN jobs j ON j.id = s.job_id
      WHERE s.user_id = $1
    )
    ORDER BY timestamp DESC
    LIMIT $2`,
    [userId, limit],
  );

  res.json({ success: true, data: activities });
});
