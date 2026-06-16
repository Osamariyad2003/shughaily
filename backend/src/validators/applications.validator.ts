import { z } from 'zod';

export const createApplicationSchema = z.object({
  job_id: z.string().uuid('Invalid job ID'),
  status: z
    .enum(['saved', 'applied', 'interviewing', 'offered', 'rejected', 'withdrawn'])
    .optional(),
  notes: z.string().max(2000).optional(),
});

export const updateApplicationSchema = z.object({
  status: z
    .enum(['saved', 'applied', 'interviewing', 'offered', 'rejected', 'withdrawn'])
    .optional(),
  notes: z.string().max(2000).optional(),
});

export const applicationIdSchema = z.object({
  id: z.string().uuid('Invalid application ID'),
});

export const applicationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(['saved', 'applied', 'interviewing', 'offered', 'rejected', 'withdrawn'])
    .optional(),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
export type ApplicationsQueryInput = z.infer<typeof applicationsQuerySchema>;
