import { Request, Response } from 'express';
import { query } from '../config/database';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../middlewares/errorHandler';
import { AuthRequest, ApiKey } from '../types';
import { generateApiKey } from '../utils/apiKey';

export const createApiKey = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { user } = req as AuthRequest;
  if (!user) throw new AppError('Authentication required.', 401);

  const { name = 'My API Key' } = req.body as { name?: string };

  const [countRow] = await query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM api_keys WHERE user_id = $1 AND is_active = TRUE',
    [user.id],
  );
  if (parseInt(countRow?.count ?? '0', 10) >= 10) {
    throw new AppError('You have reached the maximum of 10 active API keys.', 400);
  }

  const { rawKey, hash, prefix } = generateApiKey();

  const [created] = await query<Pick<ApiKey, 'id' | 'name' | 'prefix' | 'created_at'>>(
    `INSERT INTO api_keys (user_id, key_hash, name, prefix)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, prefix, created_at`,
    [user.id, hash, name.trim().slice(0, 100), prefix],
  );

  res.status(201).json({
    success: true,
    data: {
      ...created,
      raw_key: rawKey,
    },
  });
});

export const listApiKeys = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { user } = req as AuthRequest;
  if (!user) throw new AppError('Authentication required.', 401);

  const keys = await query<Omit<ApiKey, 'key_hash' | 'user_id'>>(
    `SELECT id, name, prefix, is_active, created_at, last_used_at
     FROM api_keys
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [user.id],
  );

  res.json({ success: true, data: keys });
});

export const revokeApiKey = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { user } = req as AuthRequest;
  if (!user) throw new AppError('Authentication required.', 401);

  const { id } = req.params;

  const [row] = await query<{ id: string }>(
    'SELECT id FROM api_keys WHERE id = $1 AND user_id = $2',
    [id, user.id],
  );
  if (!row) throw new AppError('API key not found.', 404);

  await query('UPDATE api_keys SET is_active = FALSE WHERE id = $1', [id]);

  res.json({ success: true, message: 'API key revoked.' });
});
