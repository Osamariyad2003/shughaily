import { z } from 'zod';

export const updateAutoApplySettingsSchema = z.object({
  enabled: z.boolean().optional(),
  min_match_threshold: z.number().int().min(0).max(100).optional(),
  daily_send_cap: z.number().int().min(1).max(100).optional(),
  dry_run: z.boolean().optional(),
  reviewed_first_send: z.boolean().optional(),
});

export type UpdateAutoApplySettingsInput = z.infer<typeof updateAutoApplySettingsSchema>;
