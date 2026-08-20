import { randomUUID } from 'crypto';
import { query } from '../config/database';
import { AutoApplySettings, AutoApplySettingsInput } from '../types';

const DEFAULTS: Omit<AutoApplySettings, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
  enabled: false,
  min_match_threshold: 80,
  daily_send_cap: 10,
  dry_run: true,
  reviewed_first_send: false,
};

/**
 * Fetch a user's auto-apply settings, creating the default (off) row on
 * first access. Mirrors the lazy-create pattern already used for
 * user_preferences.
 */
export async function getAutoApplySettings(userId: string): Promise<AutoApplySettings> {
  const rows = await query<AutoApplySettings>(
    `SELECT id, user_id, enabled, min_match_threshold, daily_send_cap, dry_run,
            reviewed_first_send, created_at, updated_at
     FROM user_auto_apply_settings
     WHERE user_id = $1`,
    [userId],
  );

  if (rows.length > 0) return rows[0];

  const created = await query<AutoApplySettings>(
    `INSERT INTO user_auto_apply_settings (id, user_id, enabled, min_match_threshold, daily_send_cap, dry_run, reviewed_first_send)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING id, user_id, enabled, min_match_threshold, daily_send_cap, dry_run,
               reviewed_first_send, created_at, updated_at`,
    [
      randomUUID(),
      userId,
      DEFAULTS.enabled,
      DEFAULTS.min_match_threshold,
      DEFAULTS.daily_send_cap,
      DEFAULTS.dry_run,
      DEFAULTS.reviewed_first_send,
    ],
  );

  return created[0];
}

/**
 * Merges `input` onto the user's current settings without persisting —
 * lets the controller validate the resulting state (e.g. the "dry_run off
 * requires reviewed_first_send" rule) before committing.
 */
export async function previewAutoApplySettingsUpdate(
  userId: string,
  input: AutoApplySettingsInput,
): Promise<AutoApplySettings> {
  const current = await getAutoApplySettings(userId);
  return { ...current, ...input };
}

/** Persists settings already validated by the caller. */
export async function updateAutoApplySettings(
  userId: string,
  next: AutoApplySettings,
): Promise<AutoApplySettings> {
  const rows = await query<AutoApplySettings>(
    `UPDATE user_auto_apply_settings
     SET enabled = $1,
         min_match_threshold = $2,
         daily_send_cap = $3,
         dry_run = $4,
         reviewed_first_send = $5,
         updated_at = NOW()
     WHERE user_id = $6
     RETURNING id, user_id, enabled, min_match_threshold, daily_send_cap, dry_run,
               reviewed_first_send, created_at, updated_at`,
    [
      next.enabled,
      next.min_match_threshold,
      next.daily_send_cap,
      next.dry_run,
      next.reviewed_first_send,
      userId,
    ],
  );

  return rows[0];
}
