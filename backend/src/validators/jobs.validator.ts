import { z } from 'zod';

export const jobsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  location: z.string().optional(),
  work_type: z.string().optional(),
  sort_by: z.enum(['created_at', 'title']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export const jobIdSchema = z.object({
  id: z.string().uuid('Invalid job ID'),
});

export type JobsQueryInput = z.infer<typeof jobsQuerySchema>;
export type JobIdInput = z.infer<typeof jobIdSchema>;
