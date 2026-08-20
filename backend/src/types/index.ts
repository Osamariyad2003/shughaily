import { Request } from 'express';

export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  country?: string | null;
  city?: string | null;
  preferred_language: 'ar' | 'en';
  search_api_key?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  target_titles: string[];
  preferred_locations: string[];
  min_salary?: number | null;
  work_type?: string | null;
  industries: string[];
}

export interface Resume {
  id: string;
  user_id: string;
  file_name?: string | null;
  file_url?: string | null;
  raw_text?: string | null;
  parsed_data?: ParsedResumeData | null;
  created_at: Date;
}

export interface ParsedResumeData {
  summary?: string;
  skills: string[];
  experience: Array<WorkExperience | string>;
  education: Array<Education | string>;
  languages: string[];
  raw_text?: string;
}

export interface WorkExperience {
  title?: string;
  company?: string;
  location?: string;
  start_date?: string;
  end_date?: string;
  description?: string;
}

export interface Education {
  degree?: string;
  institution?: string;
  field_of_study?: string;
  year?: string;
}

export interface Job {
  id: string;
  source?: string | null;
  external_id?: string | null;
  title: string;
  normalized_title?: string | null;
  company?: string | null;
  location?: string | null;
  description?: string | null;
  salary_text?: string | null;
  employment_type?: string | null;
  apply_url?: string | null;
  employer_logo?: string | null;
  /** Contact email parsed from the posting at ingestion time. NULL = not apply-by-email. */
  apply_email?: string | null;
  /** The posting's actual publication date, normalized via
   * parseJobPostedDate() from whatever format the source reported. NULL =
   * unknown (many sources omit it), not "very old" — see the search-agent
   * recency filter's missing-date policy. Distinct from created_at (when
   * we ingested the row). */
  posted_at?: Date | null;
  created_at: Date;
}

export interface Match {
  id?: string;
  user_id?: string;
  job_id: string;
  score: number;
  explanation_ar: string;
  matched_skills?: string[];
  missing_skills?: string[];
  created_at?: Date;
  job?: Job;
}

export interface Application {
  id: string;
  user_id: string;
  job_id: string;
  status: 'saved' | 'applied' | 'interviewing' | 'offered' | 'rejected' | 'withdrawn';
  notes?: string | null;
  applied_at?: Date | null;
  updated_at: Date;
  job?: Job;
}

export interface SavedJob {
  id: string;
  user_id: string;
  job_id: string;
  created_at: Date;
  job?: Job;
}

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
  /** Populated by apiKeyAuth middleware when a request is authenticated via x-api-key */
  apiKeyId?: string;
}

// ---------------------------------------------------------------------------
// API Keys
// ---------------------------------------------------------------------------
export interface ApiKey {
  id: string;
  user_id: string;
  key_hash: string;
  name: string;
  prefix: string;
  is_active: boolean;
  created_at: Date;
  last_used_at: Date | null;
}

// ---------------------------------------------------------------------------
// Billing / Usage
// ---------------------------------------------------------------------------
export type PlanTier = 'free' | 'starter' | 'pro' | 'enterprise';

export interface BillingSubscription {
  id?: string;
  user_id?: string;
  plan_tier: PlanTier;
  monthly_token_quota: number;
  current_token_usage: number;
  cycle_reset_date: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface UsageLog {
  id: string;
  user_id: string;
  api_key_id: string | null;
  endpoint: string;
  tokens_used: number;
  estimated_cost: number;
  timestamp: Date;
}

export interface DailyUsageStat {
  date: string;
  tokens_used: number;
  cost: number;
}

export interface EndpointUsageStat {
  endpoint: string;
  tokens_used: number;
  cost: number;
  call_count: number;
}

export interface JwtPayload {
  id: string;
  email: string;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiChatRequest {
  messages: AiChatMessage[];
  user_id: string;
  context?: Record<string, unknown>;
  language?: 'ar' | 'en';
}

export interface AiMatchRequest {
  resume_id: string;
  user_id: string;
  filters?: Record<string, unknown>;
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
  | 'c_level';

export type SearchAgentWorkMode = 'onsite' | 'hybrid' | 'remote';

export type SearchAgentCompanySize = 'startup' | 'small' | 'mid_market' | 'enterprise';

export interface SearchAgentInput {
  name: string;
  target_titles: string[];
  seniority: SearchAgentSeniority[];
  preferred_locations: string[];
  work_modes: SearchAgentWorkMode[];
  industries: string[];
  company_sizes: SearchAgentCompanySize[];
  /** Drop results older than this many days (based on Job.posted_at, via
   * parseJobPostedDate()). Default 30 — "last 30 days". */
  max_age_days: number;
  include_keywords: string[];
  exclude_keywords: string[];
  blacklist_companies: string[];
  source_preferences: string[];
  active?: boolean;
}

export type SearchAgentStatus = 'idle' | 'searching' | 'ready' | 'error';

export interface SearchAgent extends SearchAgentInput {
  id: string;
  user_id: string;
  active: boolean;
  /** Lifecycle status for the async-create flow — 'searching' while the
   * first (or a re-triggered) run is queued/in-flight; lets the frontend
   * poll instead of the create request blocking on a full search. */
  status: SearchAgentStatus;
  last_run_at?: Date | null;
  new_jobs_count: number;
  avg_match_score: number;
  created_at: Date;
  updated_at: Date;
}

export interface CandidateProfileSummary {
  ready: boolean;
  needs_resume: boolean;
  needs_parsing: boolean;
  source: 'none' | 'resume' | 'resume+user';
  resume_id?: string | null;
  summary?: string | null;
  skills: string[];
  preferred_roles: string[];
  inferred_seniority?: SearchAgentSeniority | null;
  preferred_locations: string[];
  experience_count: number;
  updated_at?: Date | null;
}

// ---------- Email auto-apply ----------

export interface AutoApplySettings {
  id: string;
  user_id: string;
  enabled: boolean;
  min_match_threshold: number;
  daily_send_cap: number;
  dry_run: boolean;
  reviewed_first_send: boolean;
  created_at: Date;
  updated_at: Date;
}

export type AutoApplySettingsInput = Partial<
  Pick<AutoApplySettings, 'enabled' | 'min_match_threshold' | 'daily_send_cap' | 'dry_run' | 'reviewed_first_send'>
>;

export type ApplyStatus = 'matched' | 'prepared' | 'sent' | 'bounced' | 'replied' | 'failed';

export interface AgentJobResult {
  id: string;
  agent_id: string;
  job_id: string;
  user_id: string;
  seen_at: Date;
  apply_status: ApplyStatus;
  message_id?: string | null;
  prepared_at?: Date | null;
  sent_at?: Date | null;
  bounced_at?: Date | null;
  replied_at?: Date | null;
  send_error?: string | null;
}

export interface AutoApplySendLogEntry {
  id: string;
  user_id: string;
  job_id: string;
  agent_id?: string | null;
  to_email: string;
  subject: string;
  dry_run: boolean;
  success: boolean;
  message_id?: string | null;
  error?: string | null;
  created_at: Date;
}
