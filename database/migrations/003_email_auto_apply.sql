\set ON_ERROR_STOP on

-- =============================================================================
-- Migration 003: Email-based auto-apply
-- Run after schema.sql and 002_api_keys_billing.sql.
--
-- Scope: ONLY jobs whose posting exposes an application email address.
-- Never automates LinkedIn/Indeed/ATS submissions.
--
-- Note: `agent_job_results` was never added to schema.sql — it has only ever
-- existed as a runtime CREATE TABLE IF NOT EXISTS in agentScheduler.ts. This
-- migration is written to be correct whether or not that table already
-- exists on the target database, using IF NOT EXISTS / IF EXISTS guards
-- throughout so it's safe to run against a fresh DB, a schema.sql-only DB,
-- or a DB where the app has already booted and self-created the table.
-- =============================================================================

-- -------------------------------------------------------------------------
-- jobs.apply_email: parsed at ingestion time from the posting text. NULL
-- means no application email was found (not eligible for auto-apply).
-- -------------------------------------------------------------------------
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS apply_email VARCHAR(320);

CREATE INDEX IF NOT EXISTS idx_jobs_apply_email
  ON jobs(apply_email)
  WHERE apply_email IS NOT NULL;

-- -------------------------------------------------------------------------
-- user_auto_apply_settings: one row per user (created lazily on first read/
-- write, mirroring user_preferences). Off by default. `dry_run` and
-- `reviewed_first_send` are both safety gates independent of `enabled` —
-- see backend/src/services/autoApply.service.ts for how they interact.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_auto_apply_settings (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID         NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

  -- Master opt-in. Off by default; auto-apply never runs without this.
  enabled               BOOLEAN      NOT NULL DEFAULT FALSE,

  -- Only jobs whose match score is >= this are eligible (0-100).
  min_match_threshold   SMALLINT     NOT NULL DEFAULT 80
                         CHECK (min_match_threshold BETWEEN 0 AND 100),

  -- Hard cap on real sends per user per calendar day.
  daily_send_cap        SMALLINT     NOT NULL DEFAULT 10
                         CHECK (daily_send_cap BETWEEN 1 AND 100),

  -- When true, the pipeline composes and logs but never actually sends.
  -- Defaults to TRUE: enabling the feature alone does not turn on real
  -- sending — the user must explicitly turn dry_run off.
  dry_run               BOOLEAN      NOT NULL DEFAULT TRUE,

  -- Must be explicitly set TRUE (via the mandatory first-send confirmation
  -- flow) before the very first real (non-dry-run) send is allowed to go
  -- out for this user. See requirement 6 ("review before first send").
  reviewed_first_send   BOOLEAN      NOT NULL DEFAULT FALSE,

  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_auto_apply_settings_user_id
  ON user_auto_apply_settings(user_id);

DROP TRIGGER IF EXISTS trg_user_auto_apply_settings_updated_at ON user_auto_apply_settings;
CREATE TRIGGER trg_user_auto_apply_settings_updated_at
  BEFORE UPDATE ON user_auto_apply_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -------------------------------------------------------------------------
-- agent_job_results: extend the existing search-agent "seen jobs" table
-- with the apply-status lifecycle. Grain stays (agent_id, job_id) for the
-- pre-existing "has this agent already surfaced this job" freshness
-- tracking — that is unrelated to auto-apply and must not change.
--
-- apply_status lifecycle: matched -> prepared -> sent -> (bounced|replied)
-- plus a practical 'failed' terminal state for send errors (SMTP failure
-- etc.) that isn't a bounce. 'matched' is the default for rows created by
-- the ordinary search-agent run and never touched by auto-apply.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_job_results (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   UUID NOT NULL REFERENCES search_agents(id) ON DELETE CASCADE,
  job_id     UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(agent_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_job_results_agent
  ON agent_job_results(agent_id);

ALTER TABLE agent_job_results ADD COLUMN IF NOT EXISTS user_id       UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE agent_job_results ADD COLUMN IF NOT EXISTS apply_status  VARCHAR(20) NOT NULL DEFAULT 'matched';
ALTER TABLE agent_job_results ADD COLUMN IF NOT EXISTS message_id    TEXT;
ALTER TABLE agent_job_results ADD COLUMN IF NOT EXISTS prepared_at   TIMESTAMPTZ;
ALTER TABLE agent_job_results ADD COLUMN IF NOT EXISTS sent_at       TIMESTAMPTZ;
ALTER TABLE agent_job_results ADD COLUMN IF NOT EXISTS bounced_at    TIMESTAMPTZ;
ALTER TABLE agent_job_results ADD COLUMN IF NOT EXISTS replied_at    TIMESTAMPTZ;
ALTER TABLE agent_job_results ADD COLUMN IF NOT EXISTS send_error    TEXT;

-- Backfill user_id for any pre-existing rows (denormalized from
-- search_agents so we can index/dedup by user without a join).
UPDATE agent_job_results ajr
SET user_id = sa.user_id
FROM search_agents sa
WHERE ajr.agent_id = sa.id AND ajr.user_id IS NULL;

ALTER TABLE agent_job_results ALTER COLUMN user_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_agent_job_results_apply_status'
  ) THEN
    ALTER TABLE agent_job_results
      ADD CONSTRAINT chk_agent_job_results_apply_status
      CHECK (apply_status IN ('matched', 'prepared', 'sent', 'bounced', 'replied', 'failed'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_agent_job_results_user_id ON agent_job_results(user_id);

-- Real dedup guarantee for "never send the same job twice": at most one row
-- per (user, job) may be in a "committed to apply" state, regardless of
-- which search agent surfaced it. Rows still sitting at 'matched' are
-- unrestricted, so two agents seeing the same job for the same user is
-- still fine — this only locks once auto-apply has acted on it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_job_results_user_job_committed
  ON agent_job_results(user_id, job_id)
  WHERE apply_status IN ('prepared', 'sent', 'bounced', 'replied');

-- -------------------------------------------------------------------------
-- auto_apply_send_log: append-only audit trail. One row per send attempt
-- (including dry-run attempts and failures), independent of the
-- agent_job_results lifecycle state above. This is what "log every send"
-- (requirement 4) refers to — agent_job_results holds current status,
-- this holds full history.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auto_apply_send_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id      UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  agent_id    UUID        REFERENCES search_agents(id) ON DELETE SET NULL,
  to_email    VARCHAR(320) NOT NULL,
  subject     TEXT        NOT NULL,
  dry_run     BOOLEAN     NOT NULL,
  success     BOOLEAN     NOT NULL,
  message_id  TEXT,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auto_apply_send_log_user_id ON auto_apply_send_log(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_apply_send_log_job_id  ON auto_apply_send_log(job_id);

-- Fast lookup for the daily send cap: count of real (non-dry-run,
-- successful) sends for a user within the current day.
CREATE INDEX IF NOT EXISTS idx_auto_apply_send_log_user_created
  ON auto_apply_send_log(user_id, created_at)
  WHERE dry_run = FALSE AND success = TRUE;
