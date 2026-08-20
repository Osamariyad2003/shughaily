-- 004_remove_search_agent_salary.sql
--
-- Drops the salary_expectation feature from search_agents: the search-agent
-- pipeline never scored, filtered, or displayed anything based on these
-- columns (verified — scoreJobForAgentFallback and the AI matcher have no
-- salary term), so they were pure unused config. The feature is being
-- removed outright rather than just hidden from the UI, so drop the data
-- rather than leave nullable+unused columns behind.
--
-- Safe to run against a database that never had these columns (IF EXISTS)
-- and safe to re-run. No data migration needed for other tables — nothing
-- else references search_agents.salary_amount/currency/period.

ALTER TABLE search_agents
    DROP COLUMN IF EXISTS salary_amount,
    DROP COLUMN IF EXISTS salary_currency,
    DROP COLUMN IF EXISTS salary_period;
