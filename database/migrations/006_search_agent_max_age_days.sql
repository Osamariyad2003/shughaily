-- 006_search_agent_max_age_days.sql
--
-- Adds search_agents.max_age_days: the recency cutoff a search agent
-- applies to its results (drop postings older than N days — see
-- runSearchAgentInner's recency filter). Defaults to 30 so every existing
-- saved agent gets "last 30 days" behavior automatically the moment this
-- migration runs, with no other action required.
--
-- Safe to run against a database that already has this column and safe to
-- re-run.

ALTER TABLE search_agents
    ADD COLUMN IF NOT EXISTS max_age_days INTEGER NOT NULL DEFAULT 30;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_search_agents_max_age_days'
    ) THEN
        ALTER TABLE search_agents
            ADD CONSTRAINT chk_search_agents_max_age_days
            CHECK (max_age_days BETWEEN 1 AND 365);
    END IF;
END;
$$;
