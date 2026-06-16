/**
 * Shared API contract types between frontend (React), backend (Express), and AI service (Flask).
 * These types define the canonical shape of all entities and responses.
 */

// ============================================================================
// Base
// ============================================================================
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  meta?: Pagination
}

export interface Pagination {
  page: number
  limit: number
  total: number
}

// ============================================================================
// Entities
// ============================================================================
export interface User {
  id: string
  name: string
  email: string
  country?: string
  city?: string
  preferred_language: string
  created_at: string
  updated_at: string
}

export interface UserPreferences {
  id: string
  user_id: string
  target_titles: string[]
  preferred_locations: string[]
  min_salary?: number
  work_type?: string
  industries: string[]
}

export interface Resume {
  id: string
  user_id: string
  file_url?: string
  file_name?: string
  raw_text?: string
  parsed_data?: ParsedResume
  created_at: string
}

export interface ParsedResume {
  summary?: string
  skills: string[]
  experience: Array<ExperienceEntry | string>
  education: Array<EducationEntry | string>
  languages: string[]
  raw_text?: string
}

export interface ExperienceEntry {
  title?: string
  company?: string
  duration?: string
  description?: string
}

export interface EducationEntry {
  degree?: string
  institution?: string
  year?: string
}

export interface Job {
  id: string
  source?: string
  external_id?: string
  title: string
  normalized_title?: string
  company?: string
  location?: string
  description?: string
  salary_text?: string
  employment_type?: string
  apply_url?: string
  posted_at?: string
  is_active?: boolean
  created_at: string
}

export interface Match {
  id?: string
  user_id?: string
  job_id: string
  score: number
  matched_skills?: string[]
  missing_skills?: string[]
  explanation_ar: string
  created_at?: string
  job?: Job
}

export interface Application {
  id: string
  user_id: string
  job_id: string
  status: ApplicationStatus
  notes?: string
  applied_at?: string
  updated_at: string
  job?: Job
}

export type ApplicationStatus =
  | 'saved'
  | 'applied'
  | 'interviewing'
  | 'offered'
  | 'rejected'
  | 'withdrawn'

export interface SavedJob {
  id: string
  user_id: string
  job_id: string
  created_at: string
  job?: Job
}

// ============================================================================
// AI responses
// ============================================================================
export interface RecommendedJob extends Job {
  match_score?: number
  matched_skills?: string[]
  missing_skills?: string[]
  explanation_ar?: string
  fit_label_ar?: string
  rank?: number
}

export interface MatchResponse {
  score: number
  matched_skills: string[]
  missing_skills: string[]
  explanation_ar: string
}

export interface CvFeedbackItem {
  section: string
  issue: string
  suggestion: string
  priority: 'high' | 'medium' | 'low'
}

export interface CvFeedbackResponse {
  summary_feedback?: string[]
  skills_feedback?: string[]
  experience_feedback?: string[]
  general_tips?: string[]
  missing_keywords?: string[]
  suggestions: CvFeedbackItem[]
}

export interface CoverLetterResponse {
  cover_letter: string
  language: string
}

export interface InterviewQuestion {
  question: string
  sample_answer: string
  category: string
}

export interface InterviewPrepResponse {
  questions: InterviewQuestion[]
  language: string
  job_title?: string
}

export interface CopilotChatResponse {
  reply: string
  intent?: string
  actions?: Array<{ type: string; label: string; data?: unknown }>
}

// ============================================================================
// Dashboard
// ============================================================================
export interface DashboardStats {
  recommendations_count: number
  applications_count: number
  saved_jobs_count: number
  profile_completion: number
}

// ============================================================================
// Auth
// ============================================================================
export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  name: string
  email: string
  password: string
}

export interface AuthResponse {
  user: User
  token: string
}
