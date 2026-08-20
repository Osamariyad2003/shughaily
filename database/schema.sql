\set ON_ERROR_STOP on

-- =============================================================================
-- الشغيلي (Al-Shughaily) - Arabic Job Copilot SaaS
-- PostgreSQL Database Schema
-- =============================================================================

-- Enable pgvector for semantic similarity search on resumes and job embeddings.
-- On some local Windows setups, pgvector is not installed yet. In that case we
-- fall back to DOUBLE PRECISION[] so the rest of the stack can boot.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
        CREATE EXTENSION IF NOT EXISTS vector;
    ELSE
        RAISE NOTICE 'pgvector is unavailable. Falling back to DOUBLE PRECISION[] embeddings for local development.';
    END IF;
END;
$$;

-- gen_random_uuid() requires pgcrypto on PG < 14; on PG 14+ it is built-in.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- Trigger function: auto-update the updated_at column on row modification.
-- Attached to every table that carries an updated_at column so application
-- code never needs to set it manually.
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- users
-- Core identity table. preferred_language defaults to 'ar' (Arabic) since the
-- primary audience is Arabic-speaking job seekers.
-- =============================================================================
CREATE TABLE users (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255)    NOT NULL,
    email           VARCHAR(255)    UNIQUE NOT NULL,
    password_hash   TEXT,
    google_id       VARCHAR(255)    UNIQUE,
    avatar_url      TEXT,
    country         VARCHAR(100),
    city            VARCHAR(100),
    preferred_language VARCHAR(10)  DEFAULT 'ar',
    search_api_key  TEXT,
    created_at      TIMESTAMPTZ     DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     DEFAULT NOW()
);

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- user_preferences
-- One-to-one with users (enforced via UNIQUE on user_id). Stores job-search
-- criteria so the matching engine can filter and rank jobs automatically.
-- Arrays (target_titles, preferred_locations, industries) allow multiple values
-- without a separate junction table, keeping queries simple.
-- =============================================================================
CREATE TABLE user_preferences (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    target_titles       TEXT[],
    preferred_locations TEXT[],
    min_salary          INTEGER,
    work_type           VARCHAR(50),
    industries          TEXT[]
);

CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);

-- =============================================================================
-- search_agents
-- Persistent saved job-search agents. Each agent represents one autonomous
-- targeting configuration that can later power scheduled search, ranking, and
-- auto-apply workflows.
-- =============================================================================
CREATE TABLE search_agents (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                VARCHAR(120) NOT NULL,
    target_titles       TEXT[]       NOT NULL DEFAULT '{}'::text[],
    seniority           TEXT[]       NOT NULL DEFAULT '{}'::text[],
    preferred_locations TEXT[]       NOT NULL DEFAULT '{}'::text[],
    work_modes          TEXT[]       NOT NULL DEFAULT '{}'::text[],
    industries          TEXT[]       NOT NULL DEFAULT '{}'::text[],
    company_sizes       TEXT[]       NOT NULL DEFAULT '{}'::text[],
    include_keywords    TEXT[]       NOT NULL DEFAULT '{}'::text[],
    exclude_keywords    TEXT[]       NOT NULL DEFAULT '{}'::text[],
    blacklist_companies TEXT[]       NOT NULL DEFAULT '{}'::text[],
    source_preferences  TEXT[]       NOT NULL DEFAULT ARRAY['linkedin', 'google_jobs', 'remotive', 'remoteok', 'arbeitnow', 'themuse']::text[],
    -- Recency cutoff: drop results whose posted_at is older than this many
    -- days (see runSearchAgentInner's recency filter). Default 30 = "last
    -- 30 days".
    max_age_days        INTEGER      NOT NULL DEFAULT 30 CHECK (max_age_days BETWEEN 1 AND 365),
    active              BOOLEAN      NOT NULL DEFAULT TRUE,
    -- Lifecycle status for the async-create flow: 'searching' while a run
    -- is queued/in-flight, so the frontend can poll instead of blocking.
    status              VARCHAR(20)  NOT NULL DEFAULT 'idle'
                         CHECK (status IN ('idle', 'searching', 'ready', 'error')),
    last_run_at         TIMESTAMPTZ,
    new_jobs_count      INTEGER      NOT NULL DEFAULT 0,
    avg_match_score     DECIMAL(5,2) NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ  DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX idx_search_agents_user_id ON search_agents(user_id);
CREATE INDEX idx_search_agents_user_active ON search_agents(user_id, active);

CREATE TRIGGER trg_search_agents_updated_at
    BEFORE UPDATE ON search_agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- resumes
-- Each user can upload multiple resumes. raw_text holds the extracted plain text
-- for full-text search; parsed_data holds structured JSON (skills, experience,
-- education) produced by the parsing pipeline.
-- =============================================================================
CREATE TABLE resumes (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_url    TEXT,
    file_name   VARCHAR(255),
    raw_text    TEXT,
    parsed_data JSONB,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_resumes_user_id ON resumes(user_id);

-- =============================================================================
-- jobs
-- Aggregated job listings from multiple sources (LinkedIn, Bayt, etc.).
-- The UNIQUE(source, external_id) constraint prevents duplicate imports.
-- normalized_title stores a cleaned/lowercased version for consistent matching
-- and is indexed for fast lookups.
-- =============================================================================
CREATE TABLE jobs (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    source            VARCHAR(50),
    external_id       VARCHAR(255),
    title             VARCHAR(500) NOT NULL,
    normalized_title  VARCHAR(500),
    company           VARCHAR(255),
    location          VARCHAR(255),
    description       TEXT,
    salary_text       VARCHAR(255),
    employment_type   VARCHAR(50),
    apply_url         TEXT,
    employer_logo     TEXT,
    -- The posting's actual publication date, normalized from whatever
    -- format the source reported (absolute/relative-English/relative-
    -- Arabic/Unix timestamp — see parseJobPostedDate()). NULL means
    -- "unknown", not "very old" — many sources omit this entirely.
    -- Distinct from created_at (when WE first ingested the row).
    posted_at         TIMESTAMPTZ,
    created_at        TIMESTAMPTZ  DEFAULT NOW(),

    CONSTRAINT uq_jobs_source_external_id UNIQUE (source, external_id)
);

CREATE INDEX idx_jobs_normalized_title ON jobs(normalized_title);
CREATE INDEX idx_jobs_posted_at ON jobs(posted_at);

-- =============================================================================
-- matches
-- AI-generated match between a user's profile/resume and a job listing.
-- score is 0-100 with two decimal places. explanation_ar stores the Arabic
-- explanation shown to the user ("لماذا يناسبك هذا العمل؟").
-- =============================================================================
CREATE TABLE matches (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID            NOT NULL REFERENCES users(id),
    job_id          UUID            NOT NULL REFERENCES jobs(id),
    score           DECIMAL(5,2),
    explanation_ar  TEXT,
    created_at      TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX idx_matches_user_id ON matches(user_id);
CREATE INDEX idx_matches_job_id  ON matches(job_id);

-- =============================================================================
-- applications
-- Tracks the lifecycle of a user's job application. Status values:
-- 'saved', 'applied', 'interviewing', 'offered', 'rejected', 'withdrawn'.
-- =============================================================================
CREATE TABLE applications (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id),
    job_id      UUID        NOT NULL REFERENCES jobs(id),
    status      VARCHAR(50) DEFAULT 'saved',
    notes       TEXT,
    applied_at  TIMESTAMPTZ,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_applications_user_id ON applications(user_id);
CREATE INDEX idx_applications_job_id  ON applications(job_id);

CREATE TRIGGER trg_applications_updated_at
    BEFORE UPDATE ON applications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- saved_jobs
-- Simple bookmark table. The UNIQUE(user_id, job_id) constraint prevents
-- duplicate saves. ON DELETE CASCADE on both FKs means saved_jobs rows are
-- cleaned up automatically when a user or job is removed.
-- =============================================================================
CREATE TABLE saved_jobs (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id      UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_saved_jobs_user_job UNIQUE (user_id, job_id)
);

CREATE INDEX idx_saved_jobs_user_id ON saved_jobs(user_id);
CREATE INDEX idx_saved_jobs_job_id  ON saved_jobs(job_id);

-- =============================================================================
-- resume_embeddings
-- Stores per-section vector embeddings for a resume (e.g. "experience",
-- "skills", "education"). vector(384) matches multilingual MiniLM output.
-- Used for semantic similarity search against job embeddings.
-- =============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector') THEN
        EXECUTE $sql$
            CREATE TABLE resume_embeddings (
                id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
                resume_id     UUID          NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
                section_name  VARCHAR(100),
                embedding     vector(384),
                created_at    TIMESTAMPTZ   DEFAULT NOW()
            )
        $sql$;
    ELSE
        EXECUTE $sql$
            CREATE TABLE resume_embeddings (
                id            UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
                resume_id     UUID               NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
                section_name  VARCHAR(100),
                embedding     DOUBLE PRECISION[],
                created_at    TIMESTAMPTZ        DEFAULT NOW()
            )
        $sql$;
    END IF;
END;
$$;

CREATE INDEX idx_resume_embeddings_resume_id ON resume_embeddings(resume_id);

-- =============================================================================
-- job_embeddings
-- One embedding per job listing. Used with pgvector's cosine distance operator
-- (<=> ) to find the most semantically similar jobs for a given resume section.
-- =============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector') THEN
        EXECUTE $sql$
            CREATE TABLE job_embeddings (
                id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
                job_id      UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
                embedding   vector(384),
                created_at  TIMESTAMPTZ DEFAULT NOW()
            )
        $sql$;
    ELSE
        EXECUTE $sql$
            CREATE TABLE job_embeddings (
                id          UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
                job_id      UUID               NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
                embedding   DOUBLE PRECISION[],
                created_at  TIMESTAMPTZ        DEFAULT NOW()
            )
        $sql$;
    END IF;
END;
$$;

CREATE INDEX idx_job_embeddings_job_id ON job_embeddings(job_id);
