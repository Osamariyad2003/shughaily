/**
 * BullMQ queue for search-agent runs. Exists so creating an agent doesn't
 * block the HTTP response on a full multi-source search (SerpAPI + 4 free
 * APIs + a LinkedIn scrape, times however many locations the agent has —
 * this can take several seconds to tens of seconds). The controller
 * creates the agent row (status: 'searching'), responds 201 immediately,
 * and enqueues the actual run here; the worker picks it up, calls the same
 * runSearchAgent() the manual "run now" button and the cron scheduler use,
 * and leaves the agent at status 'ready' or 'error' when done — the
 * frontend polls GET /search-agents to observe the transition out of
 * 'searching'.
 */

import { Queue, Worker, Job as BullJob } from 'bullmq';
import { config } from '../config';
import { parseRedisConnection } from '../config/redisConnection';
import { runSearchAgent } from '../services/searchAgent.service';

export interface SearchAgentRunPayload {
  userId: string;
  agentId: string;
}

const connection = parseRedisConnection(config.redisUrl);

export const searchAgentRunQueue = new Queue<SearchAgentRunPayload>('search-agent-run', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 2_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});

/** Fire-and-forget: enqueue a run for an agent that was just created (or needs re-running). */
export function enqueueSearchAgentRun(payload: SearchAgentRunPayload): void {
  searchAgentRunQueue.add('run', payload).catch((err) =>
    console.error('[SearchAgentRunQueue] Failed to enqueue run:', err),
  );
}

/**
 * Starts the BullMQ worker that consumes search-agent-run jobs.
 * Call once at server startup.
 */
export function startSearchAgentRunWorker(): Worker<SearchAgentRunPayload> {
  const worker = new Worker<SearchAgentRunPayload>(
    'search-agent-run',
    async (job: BullJob<SearchAgentRunPayload>) => {
      const { userId, agentId } = job.data;
      // runSearchAgent owns its own status lifecycle end-to-end now
      // ('searching' → 'ready', or 'error' if it throws) — see
      // searchAgent.service.ts. This worker just needs to let a thrown
      // error propagate so BullMQ's retry/backoff kicks in.
      const result = await runSearchAgent(userId, agentId);
      if (!result) {
        console.warn(`[SearchAgentRunWorker] Agent ${agentId} not found (user ${userId}); skipping.`);
      }
    },
    { connection, concurrency: 3 },
  );

  worker.on('failed', (job, err) =>
    console.error(`[SearchAgentRunWorker] Job ${job?.id} failed: ${err.message}`),
  );

  let suppressedCount = 0;
  worker.on('error', (err) => {
    if (suppressedCount < 3) {
      console.error(`[SearchAgentRunWorker] Error: ${err.message}`);
    } else if (suppressedCount === 3) {
      console.warn('[SearchAgentRunWorker] Redis unavailable — suppressing further connection errors.');
    }
    suppressedCount++;
  });

  return worker;
}
