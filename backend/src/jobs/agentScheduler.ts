/**
 * Automated search-agent scheduler.
 *
 * Runs every 2 hours (configurable via AGENT_CRON env var).
 * For each active search agent:
 *   1. Builds a query from the agent's target_titles + saved/applied job titles
 *   2. Searches across all sources (LinkedIn, Google Jobs, Remotive, etc.)
 *   3. Scores results, filters duplicates vs. previously-seen jobs
 *   4. Updates agent stats (new_jobs_count, avg_match_score, last_run_at)
 *   5. Stores new job IDs in agent_job_results so they aren't re-counted
 */

import cron from 'node-cron';
import { query } from '../config/database';
import {
  ensureAgentJobResultsTable,
  recordSeenJobs,
  runSearchAgent,
} from '../services/searchAgent.service';
import { jobSearchService } from '../services/jobSearch.service';
import { runEmailAutoApplyForAgent } from '../services/autoApplyRunner.service';

// ── Helpers ────────────────────────────────────────────────────────────

/** Get titles from a user's saved and applied jobs to enrich agent queries. */
async function getLearningTitles(userId: string): Promise<string[]> {
  const rows = await query<{ title: string }>(
    `SELECT DISTINCT j.title
     FROM (
       SELECT job_id FROM saved_jobs WHERE user_id = $1
       UNION
       SELECT job_id FROM applications WHERE user_id = $1 AND status IN ('applied','interviewing','offered')
     ) AS liked
     JOIN jobs j ON j.id = liked.job_id
     WHERE j.title IS NOT NULL`,
    [userId],
  );
  return rows.map((r) => r.title);
}

// ── Core run ───────────────────────────────────────────────────────────

interface AgentRow {
  id: string;
  user_id: string;
  name: string;
}

async function runAllActiveAgents(): Promise<void> {
  const agents = await query<AgentRow>(
    `SELECT id, user_id, name FROM search_agents WHERE active = TRUE`,
    [],
  );

  if (agents.length === 0) {
    console.log('[Scheduler] No active agents to run.');
    return;
  }

  console.log(`[Scheduler] Running ${agents.length} active agent(s)...`);

  for (const agent of agents) {
    const start = Date.now();
    try {
      // Get titles from saved/applied jobs to enrich the search.
      const learningTitles = await getLearningTitles(agent.user_id);

      // Run the standard agent search.
      const result = await runSearchAgent(agent.user_id, agent.id);
      if (!result) {
        console.log(`[Scheduler] Agent "${agent.name}" (${agent.id}): skipped (not found)`);
        continue;
      }

      // result.new_jobs_count is already the true new-vs-seen count —
      // runSearchAgent() records it into agent_job_results itself now.

      // Email auto-apply: only acts on this agent's own scored jobs (has
      // match_score, so the min-match threshold is meaningful) — never on
      // the unscored "learned titles" search below. No-ops entirely unless
      // the user has explicitly enabled it (see autoApplyRunner.service.ts).
      try {
        const autoApply = await runEmailAutoApplyForAgent(agent.id, agent.user_id, result.jobs);
        if (autoApply.eligible > 0) {
          console.log(
            `[Scheduler]   auto-apply: ${autoApply.eligible} eligible, ${autoApply.sent} sent, ` +
              `${autoApply.prepared - autoApply.sent} prepared/dry-run, ${autoApply.skippedDailyCap} capped, ${autoApply.failed} failed`,
          );
        }
      } catch (err) {
        // Non-critical — the search-agent run itself already succeeded.
        console.error(`[Scheduler]   auto-apply failed for agent "${agent.name}":`, (err as Error).message);
      }

      // If we have learning titles, fire an extra search with those titles to
      // find similar jobs the agent's own keywords might miss.
      if (learningTitles.length > 0) {
        const extraQuery = learningTitles.slice(0, 3).join(' OR ');
        try {
          const extra = await jobSearchService.search({
            query: extraQuery,
            page: 1,
          });
          const extraNew = await recordSeenJobs(agent.id, agent.user_id, extra.jobs);
          if (extraNew > 0) {
            console.log(
              `[Scheduler]   + ${extraNew} extra job(s) from learned titles`,
            );
          }
        } catch {
          // Non-critical — the main search already succeeded.
        }
      }

      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(
        `[Scheduler] Agent "${agent.name}": ${result.jobs.length} scored, ${result.new_jobs_count} new, ` +
          `avg ${result.avg_match_score}%${result.scoring_degraded ? ' (degraded: AI matcher partly unavailable)' : ''} (${elapsed}s)`,
      );
    } catch (err) {
      console.error(
        `[Scheduler] Agent "${agent.name}" (${agent.id}) failed:`,
        (err as Error).message,
      );
    }
  }

  console.log('[Scheduler] Run complete.');
}

// ── Public API ─────────────────────────────────────────────────────────

let scheduled = false;

/**
 * Start the cron scheduler. Safe to call multiple times — only the first
 * call actually schedules. Default: every 2 hours.
 */
export async function startAgentScheduler(): Promise<void> {
  if (scheduled) return;
  scheduled = true;

  await ensureAgentJobResultsTable();

  const cronExpr = process.env.AGENT_CRON ?? '0 */2 * * *'; // every 2 hours
  cron.schedule(cronExpr, () => {
    runAllActiveAgents().catch((err) =>
      console.error('[Scheduler] Unhandled error:', err),
    );
  });

  console.log(`[Scheduler] Agent scheduler started (cron: "${cronExpr}")`);

  // Also run immediately on first startup so agents get fresh data right away.
  setTimeout(() => {
    runAllActiveAgents().catch((err) =>
      console.error('[Scheduler] Initial run error:', err),
    );
  }, 10_000); // 10s after boot to let everything else initialize
}

/**
 * Run all active agents on-demand (e.g. from an admin endpoint).
 */
export { runAllActiveAgents };
