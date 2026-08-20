import { Queue, Worker, Job as BullJob } from 'bullmq';
import { config } from '../config';
import { parseRedisConnection } from '../config/redisConnection';
import { withTransaction } from '../config/database';

export interface UsageLogPayload {
  userId: string;
  apiKeyId: string | null;
  endpoint: string;
  tokensUsed: number;
  estimatedCost: number;
}

const connection = parseRedisConnection(config.redisUrl);

export const usageQueue = new Queue<UsageLogPayload>('usage-logging', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1_000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
  },
});

/**
 * Fire-and-forget helper: enqueue a usage log entry after a successful AI call.
 *
 * Usage in your AI route handler:
 *   enqueueUsageLog({
 *     userId: req.user.id,
 *     apiKeyId: req.apiKeyId ?? null,
 *     endpoint: req.path,               // e.g. '/api/v1/copilot/chat'
 *     tokensUsed: result.tokens,
 *     estimatedCost: result.tokens * 0.000001,
 *   });
 */
export function enqueueUsageLog(data: UsageLogPayload): void {
  usageQueue.add('log', data).catch((err) =>
    console.error('[UsageQueue] Failed to enqueue log:', err),
  );
}

/**
 * Starts the BullMQ worker that consumes usage-logging jobs.
 * Call once at server startup.
 */
export function startUsageWorker(): Worker<UsageLogPayload> {
  const worker = new Worker<UsageLogPayload>(
    'usage-logging',
    async (job: BullJob<UsageLogPayload>) => {
      const { userId, apiKeyId, endpoint, tokensUsed, estimatedCost } = job.data;

      await withTransaction(async (client) => {
        // 1. Append the log entry
        await client.query(
          `INSERT INTO usage_logs (user_id, api_key_id, endpoint, tokens_used, estimated_cost)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, apiKeyId, endpoint, tokensUsed, estimatedCost],
        );

        // 2. Atomically increment the billing counter (upsert handles missing rows)
        await client.query(
          `INSERT INTO billing_subscriptions (user_id, current_token_usage)
           VALUES ($1, $2)
           ON CONFLICT (user_id)
           DO UPDATE SET
             current_token_usage =
               billing_subscriptions.current_token_usage + EXCLUDED.current_token_usage,
             updated_at = NOW()`,
          [userId, tokensUsed],
        );
      });
    },
    { connection, concurrency: 5 },
  );

  worker.on('failed', (job, err) =>
    console.error(`[UsageWorker] Job ${job?.id} failed: ${err.message}`),
  );

  let suppressedCount = 0;
  worker.on('error', (err) => {
    if (suppressedCount < 3) {
      console.error(`[UsageWorker] Error: ${err.message}`);
    } else if (suppressedCount === 3) {
      console.warn('[UsageWorker] Redis unavailable — suppressing further connection errors.');
    }
    suppressedCount++;
  });

  return worker;
}
