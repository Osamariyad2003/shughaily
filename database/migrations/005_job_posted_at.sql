-- 005_job_posted_at.sql
--
-- Adds jobs.posted_at: the job posting's actual publication date, parsed
-- via the shared parseJobPostedDate() util from whatever format each
-- source reports (absolute, relative-English, relative-Arabic, or a Unix
-- timestamp — see backend/src/utils/parseJobPostedDate.ts). Nullable by
-- design: many sources omit a date entirely (confirmed live — a real
-- SerpAPI/Google Jobs response had no detected_extensions.posted_at on
-- several results), and NULL is exactly "unknown", not "very old". The
-- search-agent recency filter (see max_age_days on search_agents) treats a
-- NULL posted_at as "include, don't drop" per that same policy.
--
-- Distinct from created_at, which is when OUR system first ingested the
-- row — a job re-scraped weeks after it was actually posted would have a
-- recent created_at but an old (correct) posted_at.
--
-- Safe to run against a database that already has this column and safe to
-- re-run.

ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;

-- Lets the recency filter's post-fetch scan (WHERE posted_at IS NOT NULL
-- AND posted_at < cutoff) use an index instead of a sequential scan as the
-- jobs table grows.
CREATE INDEX IF NOT EXISTS idx_jobs_posted_at ON jobs(posted_at);
