import { Request, Response } from 'express';
import { query } from '../config/database';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../middlewares/errorHandler';
import { AuthRequest, BillingSubscription, DailyUsageStat, EndpointUsageStat } from '../types';

export const getBillingStats = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { user } = req as AuthRequest;
  if (!user) throw new AppError('Authentication required.', 401);

  const userId = user.id;

  const [subscriptionRows, dailyRows, endpointRows] = await Promise.all([
    query<BillingSubscription>(
      `SELECT plan_tier, monthly_token_quota, current_token_usage, cycle_reset_date
       FROM billing_subscriptions
       WHERE user_id = $1`,
      [userId],
    ),

    query<{ date: string; tokens_used: string; cost: string }>(
      `SELECT
         DATE(timestamp)      AS date,
         SUM(tokens_used)     AS tokens_used,
         SUM(estimated_cost)  AS cost
       FROM usage_logs
       WHERE user_id = $1
         AND timestamp >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(timestamp)
       ORDER BY date ASC`,
      [userId],
    ),

    query<{ endpoint: string; tokens_used: string; cost: string; call_count: string }>(
      `SELECT
         endpoint,
         SUM(tokens_used)    AS tokens_used,
         SUM(estimated_cost) AS cost,
         COUNT(*)            AS call_count
       FROM usage_logs
       WHERE user_id = $1
         AND timestamp >= NOW() - INTERVAL '30 days'
       GROUP BY endpoint
       ORDER BY tokens_used DESC`,
      [userId],
    ),
  ]);

  const sub = subscriptionRows[0] ?? {
    plan_tier: 'free' as const,
    monthly_token_quota: 100000,
    current_token_usage: 0,
    cycle_reset_date: null,
  };

  const dailyUsage: DailyUsageStat[] = dailyRows.map((r) => ({
    date: r.date,
    tokens_used: parseInt(r.tokens_used, 10),
    cost: parseFloat(r.cost),
  }));

  const endpointBreakdown: EndpointUsageStat[] = endpointRows.map((r) => ({
    endpoint: r.endpoint,
    tokens_used: parseInt(r.tokens_used, 10),
    cost: parseFloat(r.cost),
    call_count: parseInt(r.call_count, 10),
  }));

  res.json({
    success: true,
    data: {
      subscription: {
        ...sub,
        remaining_quota: Math.max(0, sub.monthly_token_quota - sub.current_token_usage),
      },
      daily_usage: dailyUsage,
      endpoint_breakdown: endpointBreakdown,
    },
  });
});
