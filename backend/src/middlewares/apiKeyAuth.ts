import { Response, NextFunction } from 'express';
import { query } from '../config/database';
import { AppError } from './errorHandler';
import { AuthRequest } from '../types';
import { hashApiKey } from '../utils/apiKey';

interface ApiKeyRow {
  api_key_id: string;
  user_id: string;
  user_email: string;
  is_active: boolean;
  current_token_usage: number;
  monthly_token_quota: number;
  cycle_reset_date: Date | null;
}

/**
 * API Key authentication + quota enforcement middleware.
 *
 * Attach to any route that should accept programmatic access via x-api-key.
 * Sets req.user and req.apiKeyId for downstream handlers.
 */
export async function apiKeyAuth(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawKey = req.headers['x-api-key'];

    if (!rawKey || typeof rawKey !== 'string' || rawKey.trim() === '') {
      throw new AppError('Missing or invalid x-api-key header.', 401);
    }

    const hash = hashApiKey(rawKey.trim());

    const [row] = await query<ApiKeyRow>(
      `SELECT
         ak.id                                        AS api_key_id,
         ak.user_id,
         u.email                                      AS user_email,
         ak.is_active,
         COALESCE(bs.current_token_usage, 0)          AS current_token_usage,
         COALESCE(bs.monthly_token_quota, 100000)     AS monthly_token_quota,
         bs.cycle_reset_date
       FROM api_keys ak
       INNER JOIN users u ON u.id = ak.user_id
       LEFT  JOIN billing_subscriptions bs ON bs.user_id = ak.user_id
       WHERE ak.key_hash = $1`,
      [hash],
    );

    if (!row) throw new AppError('Invalid API key.', 401);
    if (!row.is_active) throw new AppError('This API key has been revoked.', 401);

    // Reset billing cycle if it has expired
    let usage = row.current_token_usage;
    if (row.cycle_reset_date && new Date(row.cycle_reset_date) <= new Date()) {
      await query(
        `UPDATE billing_subscriptions
         SET current_token_usage = 0,
             cycle_reset_date    = (DATE_TRUNC('month', NOW()) + INTERVAL '1 month')::DATE,
             updated_at          = NOW()
         WHERE user_id = $1`,
        [row.user_id],
      );
      usage = 0;
    }

    if (usage >= row.monthly_token_quota) {
      throw new AppError(
        'Monthly token quota exceeded. Please upgrade your plan or wait for the next billing cycle.',
        429,
      );
    }

    // Update last_used_at fire-and-forget (never blocks the request)
    query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [row.api_key_id]).catch(
      (err) => console.error('[apiKeyAuth] last_used_at update failed:', err),
    );

    req.user = { id: row.user_id, email: row.user_email };
    req.apiKeyId = row.api_key_id;

    next();
  } catch (err) {
    next(err);
  }
}
