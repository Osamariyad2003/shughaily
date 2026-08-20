import { z } from 'zod';

// Emails are normalized (trimmed + lowercased) before any uniqueness check
// or lookup — Postgres's default collation is case-sensitive, so without
// this "User@Example.com" and "user@example.com" would be treated as two
// different accounts despite being the same real-world mailbox.
const emailSchema = z
  .string()
  .email('Please provide a valid email address')
  .trim()
  .toLowerCase();

export const registerSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must not exceed 100 characters')
    .trim(),
  email: emailSchema,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters'),
  country: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
