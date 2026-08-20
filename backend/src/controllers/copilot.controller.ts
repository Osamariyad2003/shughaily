import { Request, Response } from 'express';
import { query } from '../config/database';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../middlewares/errorHandler';
import { aiService } from '../services/ai.service';
import { AuthRequest, Resume } from '../types';

async function getLatestResumeId(userId: string): Promise<string | null> {
  const rows = await query<Resume>(
    `SELECT id, user_id, file_name, file_url, raw_text, parsed_data, created_at
     FROM resumes
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId],
  );

  return rows[0]?.id ?? null;
}

export const chat = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);

  const { messages, message, context, language = 'ar' } = req.body as {
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
    message?: string;
    context?: Record<string, unknown>;
    language?: 'ar' | 'en';
  };

  const normalizedMessages =
    Array.isArray(messages) && messages.length > 0
      ? messages
      : typeof message === 'string' && message.trim()
        ? [{ role: 'user' as const, content: message.trim() }]
        : [];

  if (normalizedMessages.length === 0) {
    throw new AppError('Provide either a message string or a non-empty messages array.', 400);
  }

  const result = await aiService.chat({
    messages: normalizedMessages,
    user_id: authReq.user.id,
    context,
    language,
  });

  res.json({ success: true, data: result });
});

export const cvFeedback = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);

  const { resume_id, language = 'ar' } = req.body;
  const resolvedResumeId = resume_id ?? (await getLatestResumeId(authReq.user.id));

  if (!resolvedResumeId) {
    throw new AppError('Upload a resume first to get CV feedback.', 400);
  }

  const result = await aiService.getCvFeedback(authReq.user.id, resolvedResumeId, language);
  res.json({ success: true, data: result });
});

export const generateCoverLetter = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);

  const { job_id, resume_id, language = 'ar' } = req.body;
  const resolvedResumeId = resume_id ?? (await getLatestResumeId(authReq.user.id));

  if (!job_id || !resolvedResumeId) {
    throw new AppError('Both job_id and an available resume are required.', 400);
  }

  const result = await aiService.generateCoverLetter(
    authReq.user.id,
    job_id,
    resolvedResumeId,
    language,
  );

  res.json({ success: true, data: result });
});

export const interviewPrep = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);

  const { job_id, resume_id, language = 'ar' } = req.body;
  const resolvedResumeId = resume_id ?? (await getLatestResumeId(authReq.user.id));

  if (!job_id) {
    throw new AppError('job_id is required.', 400);
  }

  const result = await aiService.getInterviewPrep(
    authReq.user.id,
    job_id,
    resolvedResumeId ?? undefined,
    language,
  );

  res.json({ success: true, data: result });
});

export const atsCheck = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);

  const { resume_id } = req.body;
  const resolvedResumeId = resume_id ?? (await getLatestResumeId(authReq.user.id));

  if (!resolvedResumeId) {
    throw new AppError('Upload a resume first to run an ATS check.', 400);
  }

  // Verify ownership
  const rows = await query<Resume>(
    'SELECT id FROM resumes WHERE id = $1 AND user_id = $2',
    [resolvedResumeId, authReq.user.id],
  );

  if (rows.length === 0) {
    throw new AppError('Resume not found.', 404);
  }

  const result = await aiService.atsCheck(authReq.user.id, resolvedResumeId);
  res.json({ success: true, data: result });
});

export const generateApplicationEmail = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthRequest;
    if (!authReq.user) throw new AppError('Authentication required.', 401);

    const { job_id, resume_id, language = 'en' } = req.body as {
      job_id?: string;
      resume_id?: string;
      language?: 'ar' | 'en';
    };

    if (!job_id) {
      throw new AppError('job_id is required.', 400);
    }

    const resolvedResumeId = resume_id ?? (await getLatestResumeId(authReq.user.id));

    const result = await aiService.generateApplicationEmail(
      authReq.user.id,
      job_id,
      resolvedResumeId,
      language,
    );

    res.json({ success: true, data: result });
  },
);

export const generateFormAnswers = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthRequest;
    if (!authReq.user) throw new AppError('Authentication required.', 401);

    const {
      job_id,
      resume_id,
      language = 'en',
      form_fields,
    } = req.body as {
      job_id?: string;
      resume_id?: string;
      language?: 'ar' | 'en';
      form_fields?: Array<{ field_label: string; type?: string; options?: string[] }>;
    };

    if (!Array.isArray(form_fields) || form_fields.length === 0) {
      throw new AppError('form_fields (non-empty array) is required.', 400);
    }

    const resolvedResumeId = resume_id ?? (await getLatestResumeId(authReq.user.id));

    const result = await aiService.generateFormAnswers({
      userId: authReq.user.id,
      jobId: job_id,
      resumeId: resolvedResumeId,
      language,
      formFields: form_fields,
    });

    res.json({ success: true, data: result });
  },
);

export const atsReview = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);

  const { job_id, resume_id, language = 'en' } = req.body as {
    job_id?: string;
    resume_id?: string;
    language?: 'ar' | 'en';
  };

  if (!job_id) {
    throw new AppError('job_id is required.', 400);
  }

  const resolvedResumeId = resume_id ?? (await getLatestResumeId(authReq.user.id));
  if (!resolvedResumeId) {
    throw new AppError('Upload a resume first to run an ATS review.', 400);
  }

  // Verify ownership
  const rows = await query<Resume>(
    'SELECT id FROM resumes WHERE id = $1 AND user_id = $2',
    [resolvedResumeId, authReq.user.id],
  );
  if (rows.length === 0) {
    throw new AppError('Resume not found.', 404);
  }

  const result = await aiService.atsReview({
    userId: authReq.user.id,
    jobId: job_id,
    resumeId: resolvedResumeId,
    language,
  });

  res.json({ success: true, data: result });
});

export const generateInterviewAnswer = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthRequest;
    if (!authReq.user) throw new AppError('Authentication required.', 401);

    const { job_id, resume_id, question, language = 'en' } = req.body as {
      job_id?: string;
      resume_id?: string;
      question?: string;
      language?: 'ar' | 'en';
    };

    if (!job_id || !question || !question.trim()) {
      throw new AppError('job_id and question are required.', 400);
    }

    const resolvedResumeId = resume_id ?? (await getLatestResumeId(authReq.user.id));

    const result = await aiService.generateInterviewAnswer({
      userId: authReq.user.id,
      jobId: job_id,
      resumeId: resolvedResumeId,
      question: question.trim(),
      language,
    });

    res.json({ success: true, data: result });
  },
);

export const applyPack = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);

  const { job_id, resume_id, language = 'en' } = req.body as {
    job_id?: string;
    resume_id?: string;
    language?: 'ar' | 'en';
  };

  if (!job_id) {
    throw new AppError('job_id is required.', 400);
  }

  const resolvedResumeId = resume_id ?? (await getLatestResumeId(authReq.user.id));
  if (!resolvedResumeId) {
    throw new AppError('Upload a resume first to generate an apply pack.', 400);
  }

  const rows = await query<Resume>(
    'SELECT id FROM resumes WHERE id = $1 AND user_id = $2',
    [resolvedResumeId, authReq.user.id],
  );
  if (rows.length === 0) {
    throw new AppError('Resume not found.', 404);
  }

  const result = await aiService.applyPack({
    userId: authReq.user.id,
    jobId: job_id,
    resumeId: resolvedResumeId,
    language,
  });

  res.json({ success: true, data: result });
});

export const autoApplyDecision = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthRequest;
    if (!authReq.user) throw new AppError('Authentication required.', 401);

    const {
      job_id,
      resume_id,
      user_profile,
      job,
      match_score,
      rules,
      language = 'en',
    } = req.body as {
      job_id?: string;
      resume_id?: string;
      user_profile?: Record<string, unknown>;
      job?: Record<string, unknown>;
      match_score?: number;
      rules?: Record<string, unknown>;
      language?: 'ar' | 'en';
    };

    if (match_score === undefined || match_score === null) {
      throw new AppError('match_score is required.', 400);
    }
    if (typeof match_score !== 'number' || Number.isNaN(match_score)) {
      throw new AppError('match_score must be a number between 0 and 100.', 400);
    }
    if (!user_profile && !authReq.user.id) {
      throw new AppError('user_profile or an authenticated user is required.', 400);
    }
    if (!job && !job_id) {
      throw new AppError('Either job or job_id is required.', 400);
    }

    const resolvedResumeId = resume_id ?? (await getLatestResumeId(authReq.user.id));

    const result = await aiService.autoApplyDecision({
      userId: authReq.user.id,
      jobId: job_id,
      resumeId: resolvedResumeId,
      userProfile: user_profile,
      job,
      matchScore: match_score,
      rules: rules ?? {},
      language,
    });

    res.json({ success: true, data: result });
  },
);

export const matchJob = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);

  const { resume_id, job_id } = req.body;
  const resolvedResumeId = resume_id ?? (await getLatestResumeId(authReq.user.id));

  if (!resolvedResumeId) {
    throw new AppError('Upload a resume first to calculate a match.', 400);
  }

  const result = await aiService.matchJobs(authReq.user.id, resolvedResumeId, job_id ? { job_id } : undefined);
  res.json({ success: true, data: result });
});
