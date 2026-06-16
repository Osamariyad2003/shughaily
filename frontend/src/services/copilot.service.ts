import { api } from '@/lib/api'
import type {
  AtsCheckResponse,
  CopilotChatResponse,
  CoverLetterResponse,
  CvFeedbackResponse,
  InterviewPrepResponse,
  RecommendedJobsResponse,
} from '@/lib/types'

export const copilotService = {
  chat: (message: string, language: 'en' | 'ar' = 'en') =>
    api.post<CopilotChatResponse>('/copilot/chat', {
      message,
      language,
    }),

  getCvFeedback: (resumeId: string) =>
    api.post<CvFeedbackResponse>('/copilot/cv-feedback', {
      resume_id: resumeId,
    }),

  generateCoverLetter: (jobId: string, resumeId: string, language = 'ar') =>
    api.post<CoverLetterResponse>('/copilot/cover-letter', {
      job_id: jobId,
      resume_id: resumeId,
      language,
    }),

  interviewPrep: (jobId: string, resumeId: string) =>
    api.post<InterviewPrepResponse>('/copilot/interview-prep', {
      job_id: jobId,
      resume_id: resumeId,
    }),

  matchJob: (jobId: string, resumeId?: string) =>
    api.post<RecommendedJobsResponse>('/copilot/match-job', {
      job_id: jobId,
      resume_id: resumeId,
    }),

  atsCheck: (resumeId: string) =>
    api.post<AtsCheckResponse>('/copilot/ats-check', {
      resume_id: resumeId,
    }),

  generateApplicationEmail: (jobId: string, resumeId?: string, language: 'en' | 'ar' = 'en') =>
    api.post<ApplicationEmailResponse>('/copilot/application-email', {
      job_id: jobId,
      resume_id: resumeId,
      language,
    }),

  generateFormAnswers: (input: {
    jobId?: string
    resumeId?: string
    language?: 'en' | 'ar'
    formFields: Array<{ field_label: string; type?: string; options?: string[] }>
  }) =>
    api.post<FormAnswersResponse>('/copilot/form-answers', {
      job_id: input.jobId,
      resume_id: input.resumeId,
      language: input.language ?? 'en',
      form_fields: input.formFields,
    }),

  generateInterviewAnswer: (input: {
    jobId: string
    question: string
    resumeId?: string
    language?: 'en' | 'ar'
  }) =>
    api.post<InterviewAnswerResponse>('/copilot/interview-answer', {
      job_id: input.jobId,
      question: input.question,
      resume_id: input.resumeId,
      language: input.language ?? 'en',
    }),

  atsReview: (input: { jobId: string; resumeId?: string; language?: 'en' | 'ar' }) =>
    api.post<AtsReviewResponse>('/copilot/ats-review', {
      job_id: input.jobId,
      resume_id: input.resumeId,
      language: input.language ?? 'en',
    }),
}

export interface ApplicationEmailResponse {
  subject: string
  body: string
  language: string
  llm: boolean
}

export interface FormAnswersResponse {
  fields: Array<{ field_label: string; type: string; answer: string }>
  language: string
  llm: boolean
}

export interface InterviewAnswerResponse {
  question: string
  answer: string
  language: string
  llm: boolean
}

export interface AtsReviewResponse {
  score: number
  keywords: { present: string[]; missing: string[]; weak: string[] }
  issues: string[]
  sections: {
    header: string
    summary: string
    experience: string
    skills: string
    education: string
  }
  rewrites: {
    bullets: Array<{ before: string; after: string }>
    summary: string
  }
  tips: string[]
  verdict: 'yes' | 'maybe' | 'no'
  top_fixes: string[]
  language: string
  llm: boolean
  job: { id: string; title: string; company: string }
}
