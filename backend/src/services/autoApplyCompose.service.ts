import { query } from '../config/database';
import { aiService } from './ai.service';
import { storageService } from './storage.service';
import { Job, Resume, User } from '../types';
import type { MailAttachment } from './mailer.service';

export interface ComposedApplication {
  toEmail: string;
  subject: string;
  text: string;
  html: string;
  attachments: MailAttachment[];
}

/**
 * Composes one tailored application email: subject + body via the existing
 * AI service's cover-letter generator, with the user's latest resume
 * attached. Pure composition — does not send or touch send-status state.
 */
export async function composeApplicationEmail(
  userId: string,
  job: Job,
): Promise<ComposedApplication> {
  if (!job.apply_email) {
    throw new Error(`Job ${job.id} has no apply_email; not eligible for email auto-apply.`);
  }

  const [userRows, resumeRows] = await Promise.all([
    query<Pick<User, 'id' | 'name' | 'preferred_language'>>(
      `SELECT id, name, preferred_language FROM users WHERE id = $1`,
      [userId],
    ),
    query<Resume>(
      `SELECT id, user_id, file_name, file_url, raw_text, parsed_data, created_at
       FROM resumes
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId],
    ),
  ]);

  const user = userRows[0];
  if (!user) throw new Error(`User ${userId} not found.`);

  const resume = resumeRows[0];
  if (!resume) throw new Error(`User ${userId} has no resume to attach; not eligible for auto-apply.`);

  const language: 'ar' | 'en' = user.preferred_language === 'en' ? 'en' : 'ar';

  const { cover_letter: coverLetter } = await aiService.generateCoverLetter(
    userId,
    job.id,
    resume.id,
    language,
  );

  const subject =
    language === 'ar'
      ? `التقديم على وظيفة ${job.title}${job.company ? ` في ${job.company}` : ''} — ${user.name}`
      : `Application for ${job.title}${job.company ? ` at ${job.company}` : ''} — ${user.name}`;

  const text = coverLetter.trim();
  const html = `<div dir="${language === 'ar' ? 'rtl' : 'ltr'}" style="font-family:sans-serif;white-space:pre-wrap;line-height:1.7">${escapeHtml(text)}</div>`;

  const attachments: MailAttachment[] = [];
  if (resume.file_url) {
    // Reuses the same signed-URL pattern the resumes controller already
    // uses for downloads; nodemailer fetches the URL itself when given as
    // `path`, so we never need to buffer the file in this process.
    const signedUrl = await storageService.getSignedUrl(resume.file_url).catch(() => resume.file_url ?? undefined);
    if (signedUrl) {
      attachments.push({
        filename: resume.file_name || 'resume.pdf',
        path: signedUrl,
      });
    }
  }

  return { toEmail: job.apply_email, subject, text, html, attachments };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
