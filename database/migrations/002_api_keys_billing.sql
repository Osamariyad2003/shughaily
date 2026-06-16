\set ON_ERROR_STOP on

-- =============================================================================
-- Migration 002: API Keys, Billing Subscriptions, and Usage Logs
-- Run after schema.sql
-- =============================================================================

-- -------------------------------------------------------------------------
-- api_keys: Stores hashed API keys for programmatic/external access.
-- The raw key is never persisted; only a SHA-256 hex digest is stored.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash     VARCHAR(64)  NOT NULL UNIQUE,
  name         VARCHAR(100) NOT NULL DEFAULT 'My Key',
  prefix       VARCHAR(20)  NOT NULL DEFAULT 'shg_',
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id     ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash    ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_active ON api_keys(user_id, is_active);

-- -------------------------------------------------------------------------
-- billing_subscriptions: Tracks each user's plan tier and token quota.
-- One row per user (UNIQUE constraint on user_id).
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan_tier           VARCHAR(20) NOT NULL DEFAULT 'free'
                      CHECK (plan_tier IN ('free', 'starter', 'pro', 'enterprise')),
  monthly_token_quota INTEGER     NOT NULL DEFAULT 100000,
  current_token_usage INTEGER     NOT NULL DEFAULT 0,
  cycle_reset_date    DATE        NOT NULL
                      DEFAULT (DATE_TRUNC('month', NOW()) + INTERVAL '1 month')::DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_user_id ON billing_subscriptions(user_id);

CREATE TRIGGER update_billing_subscriptions_updated_at
  BEFORE UPDATE ON billing_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-provision a free subscription row the moment a new user registers.
CREATE OR REPLACE FUNCTION provision_free_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO billing_subscriptions (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_provision_subscription ON users;
CREATE TRIGGER trg_provision_subscription
  AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION provision_free_subscription();

-- -------------------------------------------------------------------------
-- usage_logs: Append-only, high-throughput table for per-request tracking.
-- Indexed for 30-day rolling window queries by user and endpoint.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usage_logs (
  id             UUID           NOT NULL DEFAULT gen_random_uuid(),
  user_id        UUID           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  api_key_id     UUID           REFERENCES api_keys(id) ON DELETE SET NULL,
  endpoint       VARCHAR(200)   NOT NULL,
  tokens_used    INTEGER        NOT NULL DEFAULT 0,
  estimated_cost NUMERIC(10, 6) NOT NULL DEFAULT 0.000000,
  timestamp      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id        ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_api_key_id     ON usage_logs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_timestamp      ON usage_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_timestamp ON usage_logs(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_endpoint       ON usage_logs(endpoint);

-- -------------------------------------------------------------------------
-- Utility: Reset expired billing cycles.
-- Call this from a nightly cron or inline during quota-check middleware.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reset_expired_quotas()
RETURNS void AS $$
BEGIN
  UPDATE billing_subscriptions
  SET
    current_token_usage = 0,
    cycle_reset_date    = (DATE_TRUNC('month', NOW()) + INTERVAL '1 month')::DATE,
    updated_at          = NOW()
  WHERE cycle_reset_date <= CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- Back-fill free subscription rows for any users created before this migration.
INSERT INTO billing_subscriptions (user_id)
SELECT id FROM users
ON CONFLICT (user_id) DO NOTHING;
