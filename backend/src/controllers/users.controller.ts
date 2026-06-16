import { Request, Response } from 'express';
import { query } from '../config/database';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../middlewares/errorHandler';
import { AuthRequest, User, UserPreferences } from '../types';

export const getProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);

  const rows = await query<User>(
    `SELECT id, name, email, password_hash, country, city, preferred_language, search_api_key, created_at, updated_at
     FROM users
     WHERE id = $1`,
    [authReq.user.id],
  );

  if (rows.length === 0) {
    throw new AppError('User not found.', 404);
  }

  const user = rows[0];
  res.json({
    success: true,
    data: {
      id: user.id,
      name: user.name,
      email: user.email,
      country: user.country ?? undefined,
      city: user.city ?? undefined,
      preferred_language: user.preferred_language,
      search_api_key: user.search_api_key ?? undefined,
      created_at: user.created_at,
      updated_at: user.updated_at,
    },
  });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);

  const { name, country, city, preferred_language } = req.body;

  const rows = await query<User>(
    `UPDATE users
     SET name = COALESCE($1, name),
         country = COALESCE($2, country),
         city = COALESCE($3, city),
         preferred_language = COALESCE($4, preferred_language),
         search_api_key = COALESCE($5, search_api_key)
     WHERE id = $6
     RETURNING id, name, email, password_hash, country, city, preferred_language, search_api_key, created_at, updated_at`,
    [name ?? null, country ?? null, city ?? null, preferred_language ?? null, req.body.search_api_key ?? null, authReq.user.id],
  );

  if (rows.length === 0) {
    throw new AppError('User not found.', 404);
  }

  const user = rows[0];
  res.json({
    success: true,
    data: {
      id: user.id,
      name: user.name,
      email: user.email,
      country: user.country ?? undefined,
      city: user.city ?? undefined,
      preferred_language: user.preferred_language,
      search_api_key: user.search_api_key ?? undefined,
      created_at: user.created_at,
      updated_at: user.updated_at,
    },
  });
});

export const getPreferences = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);

  const rows = await query<UserPreferences>(
    `SELECT id, user_id, target_titles, preferred_locations, min_salary, work_type, industries
     FROM user_preferences
     WHERE user_id = $1`,
    [authReq.user.id],
  );

  if (rows.length === 0) {
    throw new AppError('Preferences not found.', 404);
  }

  res.json({ success: true, data: rows[0] });
});

export const updatePreferences = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);

  const { target_titles, preferred_locations, min_salary, work_type, industries } = req.body;

  const rows = await query<UserPreferences>(
    `UPDATE user_preferences
     SET target_titles = COALESCE($1, target_titles),
         preferred_locations = COALESCE($2, preferred_locations),
         min_salary = COALESCE($3, min_salary),
         work_type = COALESCE($4, work_type),
         industries = COALESCE($5, industries)
     WHERE user_id = $6
     RETURNING id, user_id, target_titles, preferred_locations, min_salary, work_type, industries`,
    [
      target_titles ?? null,
      preferred_locations ?? null,
      min_salary ?? null,
      work_type ?? null,
      industries ?? null,
      authReq.user.id,
    ],
  );

  if (rows.length === 0) {
    throw new AppError('Preferences not found.', 404);
  }

  res.json({ success: true, data: rows[0] });
});
