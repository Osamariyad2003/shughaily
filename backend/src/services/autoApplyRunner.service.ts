import { query } from '../config/database';
import { getAutoApplySettings } from './autoApplySettings.service';
import { composeApplicationEmail } from './autoApplyCompose.service';
import { mailerService } from './mailer.service';
import type { ScoredJob } from './searchAgent.service';

export interface AutoApplyRunSummary {
  eligible: number;
  prepared: number;
  sent: number;
  skippedDailyCap: number;
  failed: number;
}

const EMPTY_SUMMARY: AutoApplyRunSummary = { eligible: 0, prepared: 0, sent: 0, skippedDailyCap: 0, failed: 0 };

async function countSentToday(userId: string): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*)::int AS count
     FROM auto_apply_send_log
     WHERE user_id = $1 AND dry_run = FALSE AND success = TRUE
       AND created_at >= date_trunc('day', NOW())`,
    [userId],
  );
  return Number(rows[0]?.count ?? 0);
}

async function hasCommittedResult(userId: string, jobId: string): Promise<boolean> {
  const rows = await query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM agent_job_results
       WHERE user_id = $1 AND job_id = $2
         AND apply_status IN ('prepared', 'sent', 'bounced', 'replied')
     ) AS exists`,
    [userId, jobId],
  );
  return Boolean(rows[0]?.exists);
}

/**
 * Atomically transitions the existing (agent_id, job_id) row from 'matched'
 * to 'prepared'. This is the real dedup gate (race-safe, unlike a plain
 * SELECT-then-act check): if another run already moved this row past
 * 'matched' — for this agent or, thanks to the partial unique index, any
 * other agent belonging to the same user — the UPDATE matches zero rows
 * and we get null back, meaning "skip, already handled".
 */
async function markPrepared(agentId: string, jobId: string): Promise<string | null> {
  const rows = await query<{ id: string }>(
    `UPDATE agent_job_results
     SET apply_status = 'prepared', prepared_at = NOW()
     WHERE agent_id = $1 AND job_id = $2 AND apply_status = 'matched'
     RETURNING id`,
    [agentId, jobId],
  );
  return rows[0]?.id ?? null;
}

async function markSent(resultId: string, messageId: string): Promise<void> {
  await query(
    `UPDATE agent_job_results SET apply_status = 'sent', sent_at = NOW(), message_id = $2 WHERE id = $1`,
    [resultId, messageId],
  );
}

async function markFailed(resultId: string, error: string): Promise<void> {
  await query(
    `UPDATE agent_job_results SET apply_status = 'failed', send_error = $2 WHERE id = $1`,
    [resultId, error.slice(0, 2000)],
  );
}

async function logSendAttempt(entry: {
  userId: string;
  jobId: string;
  agentId: string;
  toEmail: string;
  subject: string;
  dryRun: boolean;
  success: boolean;
  messageId?: string;
  error?: string;
}): Promise<void> {
  await query(
    `INSERT INTO auto_apply_send_log (user_id, job_id, agent_id, to_email, subject, dry_run, success, message_id, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      entry.userId,
      entry.jobId,
      entry.agentId,
      entry.toEmail,
      entry.subject,
      entry.dryRun,
      entry.success,
      entry.messageId ?? null,
      entry.error?.slice(0, 2000) ?? null,
    ],
  );
}

/**
 * After a search-agent run, look at its scored jobs and — only if the user
 * has explicitly opted in (`settings.enabled`) — compose and, subject to
 * the dry-run / daily-cap / first-send-review safety rails, send email
 * applications for eligible jobs.
 *
 * Eligibility: `job.apply_email` is set (email-apply only — never
 * LinkedIn/Indeed/ATS) and `job.match_score >= settings.min_match_threshold`.
 * Every attempt is logged via `auto_apply_send_log` regardless of outcome.
 *
 * Only ever called with the agent's own properly-scored `result.jobs` — the
 * scheduler's supplementary "learned titles" search returns raw, unscored
 * jobs that can't be threshold-filtered, so those are intentionally never
 * passed here.
 */
export async function runEmailAutoApplyForAgent(
  agentId: string,
  userId: string,
  scoredJobs: ScoredJob[],
): Promise<AutoApplyRunSummary> {
  const settings = await getAutoApplySettings(userId);
  if (!settings.enabled) return EMPTY_SUMMARY;

  const eligibleJobs = scoredJobs.filter(
    (job) => job.apply_email && job.match_score >= settings.min_match_threshold,
  );
  if (eligibleJobs.length === 0) return EMPTY_SUMMARY;

  const summary: AutoApplyRunSummary = { ...EMPTY_SUMMARY };

  // Dry-run sends never count against the cap — only real, successful sends do.
  let sentToday = settings.dry_run ? 0 : await countSentToday(userId);

  for (const job of eligibleJobs) {
    summary.eligible += 1;

    // Cheap early skip before touching the compose/AI path. The authoritative
    // guarantee is the atomic UPDATE in markPrepared() below.
    if (await hasCommittedResult(userId, job.id)) continue;

    if (!settings.dry_run && sentToday >= settings.daily_send_cap) {
      summary.skippedDailyCap += 1;
      continue;
    }

    const resultId = await markPrepared(agentId, job.id);
    if (!resultId) continue; // lost the race to another run — already handled
    summary.prepared += 1;

    let composed;
    try {
      composed = await composeApplicationEmail(userId, job);
    } catch (err) {
      const message = (err as Error).message;
      await markFailed(resultId, message);
      await logSendAttempt({
        userId, jobId: job.id, agentId,
        toEmail: job.apply_email ?? '(unknown)', subject: '(compose failed)',
        dryRun: settings.dry_run, success: false, error: message,
      });
      summary.failed += 1;
      continue;
    }

    if (settings.dry_run) {
      // Composes and logs, never sends. Row stays 'prepared' — dry-run
      // never transitions to 'sent'.
      await logSendAttempt({
        userId, jobId: job.id, agentId,
        toEmail: composed.toEmail, subject: composed.subject,
        dryRun: true, success: true,
      });
      continue;
    }

    try {
      const { messageId } = await mailerService.send({
        to: composed.toEmail,
        subject: composed.subject,
        text: composed.text,
        html: composed.html,
        attachments: composed.attachments,
        headers: { 'X-Shughaily-Job-Id': job.id },
      });
      await markSent(resultId, messageId);
      await logSendAttempt({
        userId, jobId: job.id, agentId,
        toEmail: composed.toEmail, subject: composed.subject,
        dryRun: false, success: true, messageId,
      });
      summary.sent += 1;
      sentToday += 1;
    } catch (err) {
      const message = (err as Error).message;
      await markFailed(resultId, message);
      await logSendAttempt({
        userId, jobId: job.id, agentId,
        toEmail: composed.toEmail, subject: composed.subject,
        dryRun: false, success: false, error: message,
      });
      summary.failed += 1;
    }
  }

  return summary;
}
