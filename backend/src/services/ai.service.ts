import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { AiChatRequest } from '../types';

class AiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.flaskAiUrl,
      timeout: 180_000, // Local CPU parsing and LLM fallback can exceed a minute.
      headers: {
        'Content-Type': 'application/json',
        // Proves this request came from us — ai-service rejects every
        // /api/* call missing/mismatching this (see its before_request
        // handler). Without it, the AI service has no way to tell "the
        // real backend" apart from anything else that can reach it.
        'X-Internal-Auth': config.internalAuthToken,
      },
    });
  }

  /**
   * Send a resume file (or parsed data) to the AI service for parsing / extraction.
   */
  async parseResume(fileUrl: string, fileType: string): Promise<Record<string, unknown>> {
    const { data } = await this.client.post('/api/parse-resume', {
      file_url: fileUrl,
      file_type: fileType,
      mime_type: fileType,
    });
    return data;
  }

  /**
   * Get job match scores for a user's resume against available jobs.
   */
  async matchJobs(
    userId: string,
    resumeId: string,
    filters?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { data } = await this.client.post('/api/match-jobs', {
      user_id: userId,
      resume_id: resumeId,
      filters,
    });
    return data;
  }

  /**
   * Score an explicit, caller-supplied list of jobs against one resume in a
   * single batched request. Used by the search-agent runner so a full run
   * doesn't fan out into one AI call per job. Unlike matchJobs(), this only
   * ever writes `matches` rows for the given job_ids — it never touches the
   * user's other match history.
   */
  async matchJobsBatch(
    userId: string,
    resumeId: string,
    jobIds: string[],
  ): Promise<Record<string, unknown>> {
    const { data } = await this.client.post('/api/match-jobs-batch', {
      user_id: userId,
      resume_id: resumeId,
      job_ids: jobIds,
    });
    return data;
  }

  /**
   * Generate a cover letter tailored to a job using user's resume.
   */
  async generateCoverLetter(
    userId: string,
    jobId: string,
    resumeId: string,
    language: 'ar' | 'en' = 'ar',
  ): Promise<{ cover_letter: string }> {
    const { data } = await this.client.post('/api/cover-letter', {
      user_id: userId,
      job_id: jobId,
      resume_id: resumeId,
      language,
    });
    return data;
  }

  /**
   * Get AI-powered feedback on a resume.
   */
  async getCvFeedback(
    userId: string,
    resumeId: string,
    language: 'ar' | 'en' = 'ar',
  ): Promise<Record<string, unknown>> {
    const { data } = await this.client.post('/api/cv-feedback', {
      user_id: userId,
      resume_id: resumeId,
      language,
    });
    return data;
  }

  /**
   * Generate interview preparation material for a specific job.
   */
  async getInterviewPrep(
    userId: string,
    jobId: string,
    resumeId?: string,
    language: 'ar' | 'en' = 'ar',
  ): Promise<Record<string, unknown>> {
    const { data } = await this.client.post('/api/interview-prep', {
      user_id: userId,
      job_id: jobId,
      resume_id: resumeId,
      language,
    });
    return data;
  }

  /**
   * Run ATS compatibility checks on a parsed resume.
   */
  async atsCheck(userId: string, resumeId: string): Promise<Record<string, unknown>> {
    const { data } = await this.client.post('/api/ats-check', {
      user_id: userId,
      resume_id: resumeId,
    });
    return data;
  }

  /**
   * Compile free-form preferences into a structured targeting configuration.
   */
  async compileJobTargeting(input: {
    preferences: string;
    resume_id?: string;
    resume_summary?: string;
    skills?: string[];
  }): Promise<Record<string, unknown>> {
    const { data } = await this.client.post('/api/job-targeting', input);
    return data;
  }

  /**
   * Generate a tailored job application email (subject + body).
   */
  async generateApplicationEmail(
    userId: string,
    jobId: string,
    resumeId: string | null,
    language: 'ar' | 'en' = 'en',
  ): Promise<{ subject: string; body: string; language: string; llm: boolean }> {
    const { data } = await this.client.post('/api/application-email', {
      user_id: userId,
      job_id: jobId,
      resume_id: resumeId,
      language,
    });
    return data;
  }

  /**
   * Generate structured answers for the detected fields of an application form.
   */
  async generateFormAnswers(input: {
    userId: string;
    jobId?: string;
    resumeId?: string | null;
    language?: 'ar' | 'en';
    formFields: Array<{
      field_label: string;
      type?: string;
      options?: string[];
    }>;
  }): Promise<{
    fields: Array<{ field_label: string; type: string; answer: string }>;
    language: string;
    llm: boolean;
  }> {
    const { data } = await this.client.post('/api/form-answers', {
      user_id: input.userId,
      job_id: input.jobId,
      resume_id: input.resumeId,
      language: input.language ?? 'en',
      form_fields: input.formFields,
    });
    return data;
  }

  /**
   * Generate a recruiter-style ATS review of a resume vs. a job description.
   */
  async atsReview(input: {
    userId: string;
    jobId: string;
    resumeId: string;
    language?: 'ar' | 'en';
  }): Promise<Record<string, unknown>> {
    const { data } = await this.client.post('/api/ats-review', {
      user_id: input.userId,
      job_id: input.jobId,
      resume_id: input.resumeId,
      language: input.language ?? 'en',
    });
    return data;
  }

  /**
   * Generate a tailored answer to a single job-interview question.
   */
  async generateInterviewAnswer(input: {
    userId: string;
    jobId: string;
    resumeId?: string | null;
    question: string;
    language?: 'ar' | 'en';
  }): Promise<{ question: string; answer: string; language: string; llm: boolean }> {
    const { data } = await this.client.post('/api/interview-answer', {
      user_id: input.userId,
      job_id: input.jobId,
      resume_id: input.resumeId,
      question: input.question,
      language: input.language ?? 'en',
    });
    return data;
  }

  /**
   * Assemble a full 'apply pack' for a given job: CV highlights, match points,
   * form answers, and a short cover letter (120-180 words).
   */
  async applyPack(input: {
    userId: string;
    jobId: string;
    resumeId: string;
    language?: 'ar' | 'en';
  }): Promise<{
    cv_highlights: string[];
    match_points: string[];
    answers: { why_this_job: string; why_hire_you: string };
    cover_letter: string;
    language: string;
    llm: boolean;
    matched_skills: string[];
    jd_analysis: Record<string, unknown>;
  }> {
    const { data } = await this.client.post('/api/apply-pack', {
      user_id: input.userId,
      job_id: input.jobId,
      resume_id: input.resumeId,
      language: input.language ?? 'en',
    });
    return data;
  }

  /**
   * Decide whether to auto-apply to a job on behalf of the user.
   *
   * Accepts either inline structured payloads (`userProfile`, `job`) or IDs
   * for the AI service to hydrate from the database. `matchScore` (0-100) and
   * `rules` are always user-supplied.
   */
  async autoApplyDecision(input: {
    userId?: string;
    jobId?: string;
    resumeId?: string | null;
    userProfile?: Record<string, unknown>;
    job?: Record<string, unknown>;
    matchScore: number;
    rules: Record<string, unknown>;
    language?: 'ar' | 'en';
  }): Promise<{
    decision: 'APPLY' | 'SKIP' | 'REVIEW';
    confidence: number;
    reasons: string[];
    missing_requirements: string[];
    risk_flags: string[];
    match_score: number;
    llm: boolean;
    language: string;
  }> {
    const { data } = await this.client.post('/api/auto-apply-decision', {
      user_id: input.userId,
      job_id: input.jobId,
      resume_id: input.resumeId,
      user_profile: input.userProfile,
      job: input.job,
      match_score: input.matchScore,
      rules: input.rules,
      language: input.language ?? 'en',
    });
    return data;
  }

  /**
   * Multi-turn conversational chat with the AI copilot.
   *
   * Flask returns 502/503 with a graceful fallback `reply` when the LLM
   * provider is rate-limited or unavailable. We forward that body instead of
   * letting axios throw, so the user sees the apology message in chat.
   */
  async chat(request: AiChatRequest): Promise<{ reply: string; intent?: string; llm?: boolean }> {
    try {
      const { data } = await this.client.post('/api/chat', request);
      return data;
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { reply?: string; intent?: string } } };
      const status = e.response?.status;
      const body = e.response?.data;
      if (body?.reply && (status === 502 || status === 503)) {
        return { reply: body.reply, intent: body.intent, llm: false };
      }
      throw err;
    }
  }
}

export const aiService = new AiService();
