import { z } from 'zod';

const textListSchema = z.array(z.string().trim().min(1)).max(25);
const sourcePreferencesSchema = z.array(z.string().trim().min(1)).max(10);
// Recency cutoff in days — 1 to 365 (a year is a generous outer bound; the
// UI only ever offers 1/7/30 presets, but the API itself isn't limited to
// those three values).
const maxAgeDaysSchema = z.number().int().min(1).max(365);

export const searchAgentIdSchema = z.object({
  id: z.string().uuid('Invalid search agent ID'),
});

export const createSearchAgentSchema = z.object({
  name: z.string().trim().min(2).max(120),
  target_titles: textListSchema.min(1, 'At least one target title is required'),
  seniority: z
    .array(
      z.enum([
        'intern',
        'junior',
        'mid',
        'senior',
        'staff',
        'principal',
        'lead',
        'manager',
        'director',
        'vp',
        'c_level',
      ]),
    )
    .max(5)
    .default([]),
  preferred_locations: textListSchema.default([]),
  work_modes: z.array(z.enum(['onsite', 'hybrid', 'remote'])).max(3).default([]),
  industries: textListSchema.default([]),
  company_sizes: z
    .array(z.enum(['startup', 'small', 'mid_market', 'enterprise']))
    .max(4)
    .default([]),
  max_age_days: maxAgeDaysSchema.default(30),
  include_keywords: textListSchema.default([]),
  exclude_keywords: textListSchema.default([]),
  blacklist_companies: textListSchema.default([]),
  source_preferences: sourcePreferencesSchema.default([]),
  active: z.boolean().optional(),
});

export const updateSearchAgentSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  target_titles: textListSchema.min(1).optional(),
  seniority: z
    .array(
      z.enum([
        'intern',
        'junior',
        'mid',
        'senior',
        'staff',
        'principal',
        'lead',
        'manager',
        'director',
        'vp',
        'c_level',
      ]),
    )
    .max(5)
    .optional(),
  preferred_locations: textListSchema.optional(),
  work_modes: z.array(z.enum(['onsite', 'hybrid', 'remote'])).max(3).optional(),
  industries: textListSchema.optional(),
  company_sizes: z
    .array(z.enum(['startup', 'small', 'mid_market', 'enterprise']))
    .max(4)
    .optional(),
  max_age_days: maxAgeDaysSchema.optional(),
  include_keywords: textListSchema.optional(),
  exclude_keywords: textListSchema.optional(),
  blacklist_companies: textListSchema.optional(),
  source_preferences: sourcePreferencesSchema.optional(),
  active: z.boolean().optional(),
});

export type CreateSearchAgentInput = z.infer<typeof createSearchAgentSchema>;
export type UpdateSearchAgentInput = z.infer<typeof updateSearchAgentSchema>;
