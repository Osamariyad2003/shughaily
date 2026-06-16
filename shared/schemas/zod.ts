/**
 * Zod validation schemas — shared validation contracts.
 * Use these in Express validators (backend) and React forms (frontend).
 */
import { z } from 'zod'

export const EmailSchema = z.string().email('بريد إلكتروني غير صالح')
export const PasswordSchema = z
  .string()
  .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
})

export const RegisterSchema = z.object({
  name: z.string().min(2, 'الاسم يجب أن يكون حرفين على الأقل'),
  email: EmailSchema,
  password: PasswordSchema,
})

export const UserPreferencesSchema = z.object({
  target_titles: z.array(z.string()).default([]),
  preferred_locations: z.array(z.string()).default([]),
  min_salary: z.number().int().positive().optional(),
  work_type: z.enum(['full_time', 'part_time', 'remote', 'contract', 'freelance']).optional(),
  industries: z.array(z.string()).default([]),
})

export const JobsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  work_type: z.string().optional(),
  location: z.string().optional(),
})

export const ApplicationStatusSchema = z.enum([
  'saved',
  'applied',
  'interviewing',
  'offered',
  'rejected',
  'withdrawn',
])

export const CreateApplicationSchema = z.object({
  job_id: z.string().uuid(),
  status: ApplicationStatusSchema.default('applied'),
  notes: z.string().optional(),
})

export const UpdateApplicationSchema = z.object({
  status: ApplicationStatusSchema.optional(),
  notes: z.string().optional(),
})

export const ChatMessageSchema = z.object({
  message: z.string().min(1, 'الرسالة مطلوبة').max(2000),
  conversation_id: z.string().optional(),
})

export type LoginInput = z.infer<typeof LoginSchema>
export type RegisterInput = z.infer<typeof RegisterSchema>
export type UserPreferencesInput = z.infer<typeof UserPreferencesSchema>
export type JobsQueryInput = z.infer<typeof JobsQuerySchema>
export type CreateApplicationInput = z.infer<typeof CreateApplicationSchema>
export type UpdateApplicationInput = z.infer<typeof UpdateApplicationSchema>
export type ChatMessageInput = z.infer<typeof ChatMessageSchema>
