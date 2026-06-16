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
  employer_logo?: string
  created_at: string
}

export interface Match {
  id?: string
  user_id?: string
  job_id: string
  score: number
  explanation_ar: string
  matched_skills?: string[]
  missing_skills?: string[]
  created_at?: string
  job?: Job
}

export interface RecommendedJob extends Job {
  match_score?: number
  matched_skills?: string[]
  missing_skills?: string[]
  explanation_ar?: string
  fit_label_ar?: string
  rank?: number
}

export interface RecommendedJobsResponse {
  matches?: Match[]
  recommended_jobs?: RecommendedJob[]
}

export type SearchAgentSeniority =
  | 'intern'
  | 'junior'
  | 'mid'
  | 'senior'
  | 'staff'
  | 'principal'
  | 'lead'
  | 'manager'
  | 'director'
  | 'vp'
  | 'c_level'

export type SearchAgentWorkMode = 'onsite' | 'hybrid' | 'remote'

export type SearchAgentCompanySize = 'startup' | 'small' | 'mid_market' | 'enterprise'

export interface SearchAgentSalaryExpectation {
  amount?: number | null
  currency?: string | null
  period: 'monthly' | 'yearly'
}

export interface SearchAgentInput {
  name: string
  target_titles: string[]
  seniority: SearchAgentSeniority[]
  preferred_locations: string[]
  work_modes: SearchAgentWorkMode[]
  industries: string[]
  company_sizes: SearchAgentCompanySize[]
  salary_expectation?: SearchAgentSalaryExpectation | null
  include_keywords: string[]
  exclude_keywords: string[]
  blacklist_companies: string[]
  source_preferences: string[]
  active?: boolean
}

export interface SearchAgent extends SearchAgentInput {
  id: string
  user_id: string
  salary_expectation: SearchAgentSalaryExpectation
  active: boolean
  last_run_at?: string | null
  new_jobs_count: number
  avg_match_score: number
  created_at: string
  updated_at: string
}

export interface CandidateProfileSummary {
  ready: boolean
  needs_resume: boolean
  needs_parsing: boolean
  source: 'none' | 'resume' | 'resume+user'
  resume_id?: string | null
  summary?: string | null
  skills: string[]
  preferred_roles: string[]
  inferred_seniority?: SearchAgentSeniority | null
  preferred_locations: string[]
  experience_count: number
  updated_at?: string | null
}

export interface SearchAgentQueryPlanSource {
  source: string
  search_text: string
  filters: {
    titles: string[]
    locations: string[]
    work_modes: SearchAgentWorkMode[]
    seniority: SearchAgentSeniority[]
    industries: string[]
    company_sizes: SearchAgentCompanySize[]
    salary_expectation: SearchAgentSalaryExpectation
  }
  strategy: string
  crawl_hints: string[]
}

export interface SearchAgentQueryPlan {
  agent_id: string
  generated_at: string
  canonical_query: string
  hard_filters: {
    exclude_keywords: string[]
    blacklist_companies: string[]
  }
  sources: SearchAgentQueryPlanSource[]
}

export interface Application {
  id: string
  user_id: string
  job_id: string
  status: 'saved' | 'applied' | 'interviewing' | 'offered' | 'rejected' | 'withdrawn'
  notes?: string
  applied_at?: string
  updated_at: string
  job_title?: string
  company?: string
  location?: string
  apply_url?: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface DashboardStats {
  recommendations_count: number
  applications_count: number
  saved_jobs_count: number
  profile_completion: number
}

export interface CvFeedback {
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
  suggestions: CvFeedback[]
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

export interface AtsCheckItem {
  name: string
  status: 'pass' | 'warning' | 'fail'
  message: string
}

export interface AtsCheckResponse {
  ats_score: number
  verdict: string
  verdict_level: 'good' | 'fair' | 'poor'
  checks: AtsCheckItem[]
  matched_keywords: string[]
  total_checks: number
  passed_checks: number
  warning_checks: number
  failed_checks: number
  llm_tips?: string | null
}

export interface CopilotChatResponse {
  reply: string
  intent?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// API Keys & Billing
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiKeyMeta {
  id: string
  name: string
  prefix: string
  is_active: boolean
  created_at: string
  last_used_at: string | null
}

export interface CreatedApiKey extends ApiKeyMeta {
  raw_key: string
}

export type PlanTier = 'free' | 'starter' | 'pro' | 'enterprise'

export interface BillingSubscriptionInfo {
  plan_tier: PlanTier
  monthly_token_quota: number
  current_token_usage: number
  remaining_quota: number
  cycle_reset_date: string | null
}

export interface DailyUsageStat {
  date: string
  tokens_used: number
  cost: number
}

export interface EndpointUsageStat {
  endpoint: string
  tokens_used: number
  cost: number
  call_count: number
}

export interface BillingStatsResponse {
  subscription: BillingSubscriptionInfo
  daily_usage: DailyUsageStat[]
  endpoint_breakdown: EndpointUsageStat[]
}
