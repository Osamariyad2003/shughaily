import { randomUUID } from 'crypto';
import { pool, query } from '../config/database';
import { jobSearchService, jobIdentityKey, isGenericRemoteLocation, isRemoteJob, SourceStatus } from './jobSearch.service';
import { aiService } from './ai.service';
import {
  CandidateProfileSummary,
  Job,
  ParsedResumeData,
  Resume,
  SearchAgent,
  SearchAgentCompanySize,
  SearchAgentInput,
  SearchAgentSeniority,
  SearchAgentStatus,
  SearchAgentWorkMode,
} from '../types';

// Must match the SourceKey union jobSearchService actually fans out to
// (company_careers/greenhouse/lever/ashby never had fetchers).
const DEFAULT_SOURCE_PREFERENCES = ['linkedin', 'google_jobs', 'remotive', 'remoteok', 'arbeitnow', 'themuse'];

type SearchAgentRow = {
  id: string;
  user_id: string;
  name: string;
  target_titles: string[] | null;
  seniority: SearchAgentSeniority[] | null;
  preferred_locations: string[] | null;
  work_modes: SearchAgentWorkMode[] | null;
  industries: string[] | null;
  company_sizes: SearchAgentCompanySize[] | null;
  max_age_days: number | null;
  include_keywords: string[] | null;
  exclude_keywords: string[] | null;
  blacklist_companies: string[] | null;
  source_preferences: string[] | null;
  active: boolean;
  status: string;
  last_run_at: Date | null;
  new_jobs_count: number | null;
  avg_match_score: number | string | null;
  created_at: Date;
  updated_at: Date;
};

type SearchAgentWriteShape = Omit<SearchAgentInput, 'active'> & {
  active: boolean;
  status: SearchAgentStatus;
};

let bootstrapPromise: Promise<void> | null = null;

function normalizeList(values?: string[] | null): string[] {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function mapSearchAgent(row: SearchAgentRow): SearchAgent {
  const sourcePreferences = normalizeList(row.source_preferences);

  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    target_titles: normalizeList(row.target_titles),
    seniority: (row.seniority ?? []) as SearchAgentSeniority[],
    preferred_locations: normalizeList(row.preferred_locations),
    work_modes: (row.work_modes ?? []) as SearchAgentWorkMode[],
    industries: normalizeList(row.industries),
    company_sizes: (row.company_sizes ?? []) as SearchAgentCompanySize[],
    max_age_days: row.max_age_days ?? 30,
    include_keywords: normalizeList(row.include_keywords),
    exclude_keywords: normalizeList(row.exclude_keywords),
    blacklist_companies: normalizeList(row.blacklist_companies),
    source_preferences: sourcePreferences.length > 0 ? sourcePreferences : [...DEFAULT_SOURCE_PREFERENCES],
    active: row.active,
    status: (row.status as SearchAgentStatus) ?? 'idle',
    last_run_at: row.last_run_at,
    new_jobs_count: row.new_jobs_count ?? 0,
    avg_match_score: Number(row.avg_match_score ?? 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toWriteShape(
  input: SearchAgentInput & { active?: boolean; status?: SearchAgentStatus },
): SearchAgentWriteShape {
  return {
    name: input.name.trim(),
    target_titles: normalizeList(input.target_titles),
    seniority: [...new Set(input.seniority ?? [])] as SearchAgentSeniority[],
    preferred_locations: normalizeList(input.preferred_locations),
    work_modes: [...new Set(input.work_modes ?? [])] as SearchAgentWorkMode[],
    industries: normalizeList(input.industries),
    company_sizes: [...new Set(input.company_sizes ?? [])] as SearchAgentCompanySize[],
    max_age_days: input.max_age_days ?? 30,
    include_keywords: normalizeList(input.include_keywords),
    exclude_keywords: normalizeList(input.exclude_keywords),
    blacklist_companies: normalizeList(input.blacklist_companies),
    source_preferences: normalizeList(input.source_preferences).length
      ? normalizeList(input.source_preferences)
      : [...DEFAULT_SOURCE_PREFERENCES],
    active: input.active ?? true,
    status: input.status ?? 'idle',
  };
}

function toInput(agent: SearchAgent): SearchAgentInput & { active?: boolean; status?: SearchAgentStatus } {
  return {
    name: agent.name,
    target_titles: agent.target_titles,
    seniority: agent.seniority,
    preferred_locations: agent.preferred_locations,
    work_modes: agent.work_modes,
    industries: agent.industries,
    company_sizes: agent.company_sizes,
    max_age_days: agent.max_age_days,
    include_keywords: agent.include_keywords,
    exclude_keywords: agent.exclude_keywords,
    blacklist_companies: agent.blacklist_companies,
    source_preferences: agent.source_preferences,
    active: agent.active,
    status: agent.status,
  };
}

async function getSearchAgentRow(userId: string, id: string): Promise<SearchAgentRow | null> {
  await ensureSearchAgentTables();
  const rows = await query<SearchAgentRow>(
    `SELECT
       id,
       user_id,
       name,
       target_titles,
       seniority,
       preferred_locations,
       work_modes,
       industries,
       company_sizes,
       max_age_days,
       include_keywords,
       exclude_keywords,
       blacklist_companies,
       source_preferences,
       active,
       status,
       last_run_at,
       new_jobs_count,
       avg_match_score,
       created_at,
       updated_at
     FROM search_agents
     WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );

  return rows[0] ?? null;
}

function extractExperienceTitles(parsedData?: ParsedResumeData | null): string[] {
  if (!parsedData?.experience?.length) return [];

  return normalizeList(
    parsedData.experience.map((entry) => {
      if (typeof entry === 'string') return entry;
      return entry?.title ?? '';
    }),
  );
}

function inferSeniorityFromText(chunks: string[]): SearchAgentSeniority | null {
  const normalized = chunks.join(' ').toLowerCase();
  const rules: Array<[SearchAgentSeniority, RegExp]> = [
    ['c_level', /\b(cio|cto|ceo|chief)\b/],
    ['vp', /\bvp|vice president\b/],
    ['director', /\bdirector\b/],
    ['manager', /\bmanager\b/],
    ['principal', /\bprincipal\b/],
    ['staff', /\bstaff\b/],
    ['lead', /\blead\b/],
    ['senior', /\bsenior|sr\.?\b/],
    ['mid', /\bmid|intermediate\b/],
    ['junior', /\bjunior|jr\.?\b/],
    ['intern', /\bintern|trainee\b/],
  ];

  for (const [level, pattern] of rules) {
    if (pattern.test(normalized)) return level;
  }

  return null;
}

export async function ensureSearchAgentTables(): Promise<void> {
  if (bootstrapPromise) {
    await bootstrapPromise;
    return;
  }

  bootstrapPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS search_agents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(120) NOT NULL,
        target_titles TEXT[] NOT NULL DEFAULT '{}'::text[],
        seniority TEXT[] NOT NULL DEFAULT '{}'::text[],
        preferred_locations TEXT[] NOT NULL DEFAULT '{}'::text[],
        work_modes TEXT[] NOT NULL DEFAULT '{}'::text[],
        industries TEXT[] NOT NULL DEFAULT '{}'::text[],
        company_sizes TEXT[] NOT NULL DEFAULT '{}'::text[],
        max_age_days INTEGER NOT NULL DEFAULT 30,
        include_keywords TEXT[] NOT NULL DEFAULT '{}'::text[],
        exclude_keywords TEXT[] NOT NULL DEFAULT '{}'::text[],
        blacklist_companies TEXT[] NOT NULL DEFAULT '{}'::text[],
        source_preferences TEXT[] NOT NULL DEFAULT ARRAY['linkedin', 'google_jobs', 'remotive', 'remoteok', 'arbeitnow', 'themuse']::text[],
        active BOOLEAN NOT NULL DEFAULT true,
        last_run_at TIMESTAMPTZ,
        new_jobs_count INTEGER NOT NULL DEFAULT 0,
        avg_match_score DECIMAL(5,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query('CREATE INDEX IF NOT EXISTS idx_search_agents_user_id ON search_agents(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_search_agents_user_active ON search_agents(user_id, active)');

    // Lifecycle status for the async-create flow: a freshly-created agent
    // starts 'searching' while its first run is queued/in-flight, so the
    // frontend can poll instead of the create request blocking on a full
    // multi-source search.
    await pool.query(`ALTER TABLE search_agents ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'idle'`);
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'chk_search_agents_status'
        ) THEN
          ALTER TABLE search_agents
            ADD CONSTRAINT chk_search_agents_status
            CHECK (status IN ('idle', 'searching', 'ready', 'error'));
        END IF;
      END;
      $$
    `);

    // The salary_expectation feature was removed outright (never used for
    // filtering/scoring/display — see database/migrations/
    // 004_remove_search_agent_salary.sql for the full rationale). Mirrored
    // here, same as the migration file, so a fresh install that only ever
    // boots the app (never runs the SQL migrations by hand) doesn't end up
    // with these columns either, and an existing install self-heals on next
    // boot instead of needing the migration run manually.
    await pool.query(`ALTER TABLE search_agents DROP COLUMN IF EXISTS salary_amount`);
    await pool.query(`ALTER TABLE search_agents DROP COLUMN IF EXISTS salary_currency`);
    await pool.query(`ALTER TABLE search_agents DROP COLUMN IF EXISTS salary_period`);

    // Recency cutoff — see database/migrations/
    // 006_search_agent_max_age_days.sql for the full rationale. Mirrored
    // here so an existing install self-heals on next boot (every existing
    // agent gets "last 30 days" behavior automatically via the DEFAULT)
    // without needing the migration run by hand.
    await pool.query(`ALTER TABLE search_agents ADD COLUMN IF NOT EXISTS max_age_days INTEGER NOT NULL DEFAULT 30`);
    await pool.query(`
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
      $$
    `);
  })();

  try {
    await bootstrapPromise;
  } catch (err) {
    bootstrapPromise = null;
    throw err;
  }
}

export async function listSearchAgents(userId: string): Promise<SearchAgent[]> {
  await ensureSearchAgentTables();
  const rows = await query<SearchAgentRow>(
    `SELECT
       id,
       user_id,
       name,
       target_titles,
       seniority,
       preferred_locations,
       work_modes,
       industries,
       company_sizes,
       max_age_days,
       include_keywords,
       exclude_keywords,
       blacklist_companies,
       source_preferences,
       active,
       status,
       last_run_at,
       new_jobs_count,
       avg_match_score,
       created_at,
       updated_at
     FROM search_agents
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );

  return rows.map(mapSearchAgent);
}

export async function createSearchAgent(
  userId: string,
  input: SearchAgentInput & { active?: boolean; status?: SearchAgentStatus },
): Promise<SearchAgent> {
  await ensureSearchAgentTables();
  const payload = toWriteShape(input);

  const rows = await query<SearchAgentRow>(
    `INSERT INTO search_agents (
       id,
       user_id,
       name,
       target_titles,
       seniority,
       preferred_locations,
       work_modes,
       industries,
       company_sizes,
       max_age_days,
       include_keywords,
       exclude_keywords,
       blacklist_companies,
       source_preferences,
       active,
       status
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
     )
     RETURNING
       id,
       user_id,
       name,
       target_titles,
       seniority,
       preferred_locations,
       work_modes,
       industries,
       company_sizes,
       max_age_days,
       include_keywords,
       exclude_keywords,
       blacklist_companies,
       source_preferences,
       active,
       status,
       last_run_at,
       new_jobs_count,
       avg_match_score,
       created_at,
       updated_at`,
    [
      randomUUID(),
      userId,
      payload.name,
      payload.target_titles,
      payload.seniority,
      payload.preferred_locations,
      payload.work_modes,
      payload.industries,
      payload.company_sizes,
      payload.max_age_days,
      payload.include_keywords,
      payload.exclude_keywords,
      payload.blacklist_companies,
      payload.source_preferences,
      payload.active,
      payload.status,
    ],
  );

  return mapSearchAgent(rows[0]);
}

export async function updateSearchAgent(
  userId: string,
  id: string,
  input: Partial<SearchAgentInput & { active?: boolean }>,
): Promise<SearchAgent | null> {
  const existingRow = await getSearchAgentRow(userId, id);
  if (!existingRow) return null;

  const existing = mapSearchAgent(existingRow);
  const merged = toWriteShape({
    ...toInput(existing),
    ...input,
    active: input.active ?? existing.active,
  });

  const rows = await query<SearchAgentRow>(
    `UPDATE search_agents
     SET
       name = $1,
       target_titles = $2,
       seniority = $3,
       preferred_locations = $4,
       work_modes = $5,
       industries = $6,
       company_sizes = $7,
       max_age_days = $8,
       include_keywords = $9,
       exclude_keywords = $10,
       blacklist_companies = $11,
       source_preferences = $12,
       active = $13,
       updated_at = NOW()
     WHERE id = $14 AND user_id = $15
     RETURNING
       id,
       user_id,
       name,
       target_titles,
       seniority,
       preferred_locations,
       work_modes,
       industries,
       company_sizes,
       max_age_days,
       include_keywords,
       exclude_keywords,
       blacklist_companies,
       source_preferences,
       active,
       status,
       last_run_at,
       new_jobs_count,
       avg_match_score,
       created_at,
       updated_at`,
    [
      merged.name,
      merged.target_titles,
      merged.seniority,
      merged.preferred_locations,
      merged.work_modes,
      merged.industries,
      merged.company_sizes,
      merged.max_age_days,
      merged.include_keywords,
      merged.exclude_keywords,
      merged.blacklist_companies,
      merged.source_preferences,
      merged.active,
      id,
      userId,
    ],
  );

  return rows[0] ? mapSearchAgent(rows[0]) : null;
}

export async function deleteSearchAgent(userId: string, id: string): Promise<boolean> {
  await ensureSearchAgentTables();
  const rows = await query<{ id: string }>(
    'DELETE FROM search_agents WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId],
  );

  return rows.length > 0;
}

export async function getSearchAgent(userId: string, id: string): Promise<SearchAgent | null> {
  const row = await getSearchAgentRow(userId, id);
  return row ? mapSearchAgent(row) : null;
}

/**
 * Sets just the lifecycle status column, independent of the general PATCH
 * update path — used by the create flow (set 'searching' right after
 * insert) and the search-agent-run queue worker (set 'ready'/'error' when
 * a queued run finishes), neither of which should go through the
 * user-facing update-agent validation/merge logic.
 */
export async function updateSearchAgentStatus(
  userId: string,
  id: string,
  status: SearchAgentStatus,
): Promise<void> {
  await query('UPDATE search_agents SET status = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3', [
    status,
    id,
    userId,
  ]);
}

export async function getCandidateProfileSummary(userId: string): Promise<CandidateProfileSummary> {
  const userRows = await query<{ city?: string | null; country?: string | null }>(
    `SELECT city, country
     FROM users
     WHERE id = $1`,
    [userId],
  );

  const preferredLocations = normalizeList([
    userRows[0]?.city ?? '',
    userRows[0]?.country ?? '',
  ]);

  const resumes = await query<Resume>(
    `SELECT id, user_id, file_name, file_url, raw_text, parsed_data, created_at
     FROM resumes
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId],
  );

  if (resumes.length === 0) {
    return {
      ready: false,
      needs_resume: true,
      needs_parsing: false,
      source: 'none',
      resume_id: null,
      summary: null,
      skills: [],
      preferred_roles: [],
      inferred_seniority: null,
      preferred_locations: preferredLocations,
      experience_count: 0,
      updated_at: null,
    };
  }

  const latestResume = resumes[0];
  const parsedData =
    latestResume.parsed_data && typeof latestResume.parsed_data === 'object'
      ? (latestResume.parsed_data as ParsedResumeData)
      : null;

  if (!parsedData) {
    return {
      ready: false,
      needs_resume: false,
      needs_parsing: true,
      source: preferredLocations.length > 0 ? 'resume+user' : 'resume',
      resume_id: latestResume.id,
      summary: latestResume.raw_text?.slice(0, 200) ?? null,
      skills: [],
      preferred_roles: [],
      inferred_seniority: null,
      preferred_locations: preferredLocations,
      experience_count: 0,
      updated_at: latestResume.created_at,
    };
  }

  const preferredRoles = extractExperienceTitles(parsedData).slice(0, 6);
  const inferredSeniority = inferSeniorityFromText([
    parsedData.summary ?? '',
    ...preferredRoles,
  ]);

  return {
    ready: true,
    needs_resume: false,
    needs_parsing: false,
    source: preferredLocations.length > 0 ? 'resume+user' : 'resume',
    resume_id: latestResume.id,
    summary: parsedData.summary ?? null,
    skills: normalizeList(parsedData.skills ?? []).slice(0, 20),
    preferred_roles: preferredRoles,
    inferred_seniority: inferredSeniority,
    preferred_locations: preferredLocations,
    experience_count: parsedData.experience?.length ?? 0,
    updated_at: latestResume.created_at,
  };
}

// ---------- Search agent execution ----------

export interface ScoredJob extends Job {
  match_score: number;
  matched_skills?: string[];
  missing_skills?: string[];
  /**
   * Which scorer actually produced match_score. 'ai' = the same semantic
   * matcher the dashboard uses (aiService.matchJobsBatch) — the normal,
   * expected path. 'lexical_fallback' = scoreJobForAgentFallback, used only
   * when the AI matcher was unavailable for this run; surfaced so it's
   * visible (UI, logs, debugging) which results didn't come from the
   * single source of truth.
   */
  scoring_method: 'ai' | 'lexical_fallback';
  /** True if isRemoteJob() detected this as a remote posting (structural
   * employment_type marker, or a remote signal in location/title/
   * description) — lets the UI label remote results. Set alongside the
   * post-scoring remote boost; see REMOTE_BOOST_SCORE_DELTA. */
  is_remote: boolean;
  /** 'unknown' when the job has no parseable posted_at — see the recency
   * filter's MISSING DATE POLICY (isWithinRecency): such jobs are kept,
   * not dropped, but tagged so the UI/caller can sort them after
   * dated-recent jobs if it wants to. 'known' otherwise. */
  date_confidence: 'known' | 'unknown';
}

export interface RunSearchAgentResult {
  agent: SearchAgent;
  jobs: ScoredJob[];
  new_jobs_count: number;
  avg_match_score: number;
  /** True if any job in this run was scored by the lexical fallback rather
   * than the AI matcher — avg_match_score already excludes those jobs when
   * possible, but this flag surfaces the degradation itself. */
  scoring_degraded: boolean;
  /** Per-source health for this run, merged across every location searched
   * (see MAX_AGENT_SEARCH_LOCATIONS) — e.g. lets the UI show "LinkedIn
   * unavailable" instead of folding a degraded/failed source into an
   * undifferentiated "no jobs found". */
  source_status: SourceStatus[];
}

// Bounds how many of an agent's preferred_locations get searched per run.
// Each location is a full multi-source fan-out (SerpAPI + 4 free APIs + a
// LinkedIn scrape), so an unbounded list would multiply run cost linearly.
const MAX_AGENT_SEARCH_LOCATIONS = 5;

// Sources safe to query with no location filter for the worldwide-remote
// pass. Deliberately excludes SerpAPI/google_jobs and LinkedIn — those stay
// location-scoped (see runSearchAgent) to avoid flooding results with jobs
// the agent never asked to see and multiplying AI-scoring cost.
const REMOTE_FRIENDLY_SOURCES = ['remotive', 'remoteok', 'arbeitnow', 'themuse'];

// Preferred-location values that mean "no geography, just remote" rather
// than a real place — mirrors jobSearch.service.ts's own isRemoteLocation
// check inside searchSerpApi. A pass targeting one of these carries no real
// location constraint from any source (SerpAPI drops its location param
// entirely and switches to a pure remote-classification filter — see
// searchSerpApi), so, like the dedicated worldwide-remote pass, its results
// need the isGenericRemoteLocation() safety net: a "remote"-classified
// Google Jobs result can still list a specific onsite city (e.g. Seattle,
// WA) as its location text, which is exactly the leak this fixes.
const REMOTE_LOCATION_STRINGS = new Set(['remote', 'عن بعد', 'remotely']);

/**
 * Merges per-location (and the worldwide-remote pass's) SourceStatus[]
 * arrays into one overall array per source. Counts sum across passes.
 * Status: 'ok' only if every pass reported 'ok'; 'error' only if every
 * pass failed (non-'ok'); anything mixed — succeeded in some, failed in
 * others — is 'degraded'. A source that's merely inconsistent shouldn't
 * read the same as one that's completely down.
 */
function mergeSourceStatuses(perPass: SourceStatus[][]): SourceStatus[] {
  const bySource = new Map<
    string,
    { source: string; count: number; okCount: number; failCount: number; note?: string }
  >();

  for (const statuses of perPass) {
    for (const s of statuses) {
      const entry = bySource.get(s.source) ?? { source: s.source, count: 0, okCount: 0, failCount: 0 };
      entry.count += s.count;
      if (s.status === 'ok') {
        entry.okCount += 1;
      } else {
        entry.failCount += 1;
        entry.note ??= s.note; // keep the first failure note as the representative one
      }
      bySource.set(s.source, entry);
    }
  }

  return Array.from(bySource.values()).map((e) => ({
    source: e.source,
    count: e.count,
    status: e.failCount === 0 ? 'ok' : e.okCount === 0 ? 'error' : 'degraded',
    note: e.failCount > 0 ? e.note : undefined,
  }));
}

function tokenize(value: string | null | undefined): Set<string> {
  if (!value) return new Set();
  return new Set(
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}+#.\s-]/gu, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 1),
  );
}

/**
 * True if the job should be dropped from agent results regardless of match
 * score — the agent's own exclude-keyword / blacklisted-company rules.
 * These are search-agent configuration, not a scoring concern, so they're
 * enforced the same way whichever scorer (AI or fallback) produced the
 * percentage.
 */
function isHardExcluded(job: Job, agent: SearchAgent): boolean {
  const haystack = tokenize(`${job.title ?? ''} ${job.description ?? ''}`);

  const excludeHit = agent.exclude_keywords.some((keyword) =>
    Array.from(tokenize(keyword)).some((token) => haystack.has(token)),
  );
  const companyBlacklisted =
    job.company != null &&
    agent.blacklist_companies.some(
      (blocked) => blocked.toLowerCase().trim() === job.company!.toLowerCase().trim(),
    );

  return excludeHit || companyBlacklisted;
}

// ---------- Recency filtering ----------
//
// Source-side date params (SerpAPI's chips date_posted bucket, LinkedIn's
// f_TPR — see jobSearch.service.ts) narrow what gets fetched in the first
// place where a source supports it, but that's a best-effort optimization,
// not the source of truth: SerpAPI's buckets are coarse, and Remotive/
// RemoteOK/Arbeitnow/TheMuse have no server-side date filter at all. This
// is the definitive filter, applied uniformly to every job's stored
// posted_at (populated at ingestion by parseJobPostedDate() — see
// jobSearch.service.ts's upsert* functions) regardless of source.

/**
 * MISSING DATE POLICY: a job with no parseable posted_at is INCLUDED, not
 * dropped. Many sources omit a posting date entirely (confirmed live —
 * several real SerpAPI/Google Jobs results had no
 * detected_extensions.posted_at), and silently dropping every undated job
 * would shrink the corpus in a way that's indistinguishable from "no jobs
 * found" — exactly the silent-over-filtering failure mode this feature is
 * built to avoid elsewhere (location/seniority). Undated jobs are tagged
 * date_confidence: 'unknown' on the scored result instead, so the caller
 * can choose to rank them behind dated-recent jobs if it wants to.
 */
function isWithinRecency(job: Job, maxAgeDays: number): boolean {
  if (!job.posted_at) return true;
  const postedAt = job.posted_at instanceof Date ? job.posted_at : new Date(job.posted_at);
  if (Number.isNaN(postedAt.getTime())) return true;
  const ageMs = Date.now() - postedAt.getTime();
  return ageMs <= maxAgeDays * 24 * 60 * 60 * 1000;
}

function dateConfidence(job: Job): 'known' | 'unknown' {
  if (!job.posted_at) return 'unknown';
  const postedAt = job.posted_at instanceof Date ? job.posted_at : new Date(job.posted_at);
  return Number.isNaN(postedAt.getTime()) ? 'unknown' : 'known';
}

// ---------- Seniority filtering ----------
//
// The corpus (jobSearchService.search) does best-effort server-side
// seniority narrowing where a source supports it (currently only LinkedIn's
// f_E param — see jobSearch.service.ts), but that alone isn't reliable
// enough: most sources (Remotive, RemoteOK, Arbeitnow, TheMuse, and
// SerpAPI/google_jobs) have no seniority filter at all, and LinkedIn's own
// 6-bucket scale is far coarser than ours. This is the definitive,
// source-independent filter: parse the job TITLE itself for a seniority
// signal and compare it against the agent's selected range.

/** Relative ordering used to measure "how far" a job's level is from an
 * agent's selected seniority range. Values are just ranks, not percentages —
 * only relative distance between two ranks matters. */
const SENIORITY_RANK: Record<SearchAgentSeniority, number> = {
  intern: 0,
  junior: 1,
  mid: 2,
  senior: 3,
  lead: 3.5,
  staff: 4,
  principal: 4.5,
  manager: 4,
  director: 5,
  vp: 6,
  c_level: 7,
};

// First-match-wins, ordered highest-seniority-signal first so a title like
// "Senior Engineering Manager" resolves to the more senior of the two words
// it contains rather than whichever happens to appear first in the string.
const TITLE_SENIORITY_PATTERNS: Array<[SearchAgentSeniority, RegExp]> = [
  ['c_level', /\b(chief|ceo|cto|cfo|coo|cpo|ciso)\b/i],
  ['vp', /\b(vp|vice president)\b/i],
  ['director', /\bdirector\b/i],
  ['principal', /\bprincipal\b/i],
  ['staff', /\bstaff\b/i],
  ['lead', /\blead\b/i],
  ['manager', /\bmanager\b/i],
  ['senior', /\b(senior|sr\.?)\b/i],
  ['mid', /\b(mid[- ]?level|intermediate)\b/i],
  ['junior', /\b(junior|jr\.?|entry[- ]?level|new ?grad|graduate)\b/i],
  ['intern', /\b(intern(ship)?|trainee|co[- ]?op)\b/i],
];

// US-tech-style roman-numeral level markers ("Engineer II", "Engineer III")
// with no accompanying word signal — these mark mid-to-senior tracks, never
// entry-level, so they're treated as 'senior' for filtering purposes (a
// coarse-but-safe read: it's enough to correctly exclude them from an
// intern/junior search, which is the failure mode this exists to fix).
// Matched anywhere in the title, not just at the very end — real postings
// routinely trail the level with more text ("Engineer II - Backend (Saudi
// Nationals)", "Engineer III, Platform Team"), so an end-anchored match
// missed exactly the titles this is meant to catch. Bare digit suffixes
// ("SWE 3") stay end-anchored only — a bare digit mid-string is too likely
// to be something else (e.g. "Web3 Developer").
const LEVEL_SUFFIX_RE = /\b(ii|iii|iv)\b|\b[2-9]\s*$/i;

/** Best-effort seniority read from a job title alone. Returns null when the
 * title gives no signal either way — ambiguous titles are never penalized,
 * only titles with an actual, parseable seniority marker. */
function inferTitleSeniority(title: string | null | undefined): SearchAgentSeniority | null {
  if (!title) return null;
  const trimmed = title.trim();
  if (!trimmed) return null;

  for (const [level, pattern] of TITLE_SENIORITY_PATTERNS) {
    if (pattern.test(trimmed)) return level;
  }
  if (LEVEL_SUFFIX_RE.test(trimmed)) return 'senior';
  return null;
}

type SeniorityVerdict = 'ok' | 'penalize' | 'drop';

// Score haircut applied to a 'penalize' verdict (one rank outside the
// agent's selected range) — enough to push a borderline-adjacent job well
// down the results without erasing it outright, since it's a soft signal.
const SENIORITY_PENALTY_SCORE_DELTA = 25;

// Modest additive nudge for remote jobs — enough to surface them near the
// top among otherwise-similar matches, deliberately small enough (relative
// to typical AI-matcher score spreads) that it can never turn a genuinely
// poor match into a top result on its own; a 20% match plus this bonus is
// still a 28% match, not competitive with a real 70%+ match. Applied once,
// uniformly, to every scored job regardless of which scorer (AI or lexical
// fallback) produced the base score — see is_remote on ScoredJob.
const REMOTE_BOOST_SCORE_DELTA = 8;

/**
 * Compares a job's inferred title seniority against the agent's configured
 * seniority[] range. 'ok' = no signal, or within/adjacent-enough to the
 * agent's range. 'penalize' = one rank outside the range — down-rank, don't
 * drop, since the title-based read is a heuristic. 'drop' = two or more
 * ranks outside — e.g. an intern/junior agent seeing a "Staff"/"Engineer
 * III" title. No agent.seniority selection at all means no filter (every
 * level is acceptable).
 */
function seniorityVerdict(jobTitle: string | null | undefined, agentSeniority: SearchAgentSeniority[]): SeniorityVerdict {
  if (agentSeniority.length === 0) return 'ok';

  const jobLevel = inferTitleSeniority(jobTitle);
  if (jobLevel === null) return 'ok';

  const jobRank = SENIORITY_RANK[jobLevel];
  const agentRanks = agentSeniority.map((s) => SENIORITY_RANK[s]);
  const minRank = Math.min(...agentRanks);
  const maxRank = Math.max(...agentRanks);

  if (jobRank >= minRank - 0.5 && jobRank <= maxRank + 0.5) return 'ok';

  const distance = jobRank < minRank ? minRank - jobRank : jobRank - maxRank;
  return distance >= 2 ? 'drop' : 'penalize';
}

/**
 * Collapses internal whitespace/trim on a target title before it's used in
 * any source query. Deliberately does NOT attempt spelling correction
 * ("Juinor" stays "Juinor") — just guarantees a query never carries
 * doubled/leading/trailing whitespace verbatim into a source's search API.
 */
function sanitizeTitleForQuery(title: string): string {
  return title.replace(/\s+/g, ' ').trim();
}

/**
 * Lexical fallback scorer — ONLY used when the AI matcher
 * (aiService.matchJobsBatch, the same one that scores dashboard/recommended
 * jobs) is unavailable for a run: request timeout, non-2xx response, or the
 * service being rate-limited. Never the primary path. Callers must tag
 * results scored this way with scoring_method: 'lexical_fallback' so it's
 * visible downstream which jobs didn't get the real semantic score.
 */
function scoreJobForAgentFallback(
  job: Job,
  agent: SearchAgent,
  profile: CandidateProfileSummary,
): Omit<ScoredJob, 'scoring_method'> {
  const haystack = tokenize(`${job.title ?? ''} ${job.description ?? ''}`);

  const titleTokens = agent.target_titles.flatMap((t) => Array.from(tokenize(t)));
  const includeTokens = agent.include_keywords.flatMap((k) => Array.from(tokenize(k)));
  const skillTokens = (profile.skills ?? []).flatMap((s) => Array.from(tokenize(s)));

  let titleHits = 0;
  for (const token of titleTokens) if (haystack.has(token)) titleHits += 1;
  const titleRatio = titleTokens.length ? titleHits / titleTokens.length : 0;

  let includeHits = 0;
  for (const token of includeTokens) if (haystack.has(token)) includeHits += 1;
  const includeRatio = includeTokens.length ? includeHits / includeTokens.length : 0;

  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];
  for (const skill of profile.skills ?? []) {
    const skillTokenSet = tokenize(skill);
    const hasAny = Array.from(skillTokenSet).some((t) => haystack.has(t));
    if (hasAny) matchedSkills.push(skill);
    else missingSkills.push(skill);
  }
  const skillRatio = skillTokens.length
    ? matchedSkills.length / Math.max(1, (profile.skills ?? []).length)
    : 0;

  // Location soft boost — preferred_locations text match only. Remote is
  // NOT boosted here: it gets one uniform post-scoring boost applied to
  // every scored job regardless of which scorer produced the base score
  // (see REMOTE_BOOST_SCORE_DELTA in runSearchAgentInner) — folding it in
  // here too would double-boost fallback-scored remote jobs relative to
  // AI-scored ones.
  let locationBoost = 0;
  if (job.location && agent.preferred_locations.length > 0) {
    const loc = job.location.toLowerCase();
    if (agent.preferred_locations.some((pl) => loc.includes(pl.toLowerCase()))) {
      locationBoost = 0.1;
    }
  }

  const rawScore = titleRatio * 0.5 + skillRatio * 0.35 + includeRatio * 0.15 + locationBoost;
  const match_score = Math.round(Math.max(0, Math.min(1, rawScore)) * 100);

  return {
    ...job,
    match_score,
    matched_skills: matchedSkills,
    missing_skills: missingSkills,
    is_remote: isRemoteJob(job),
    date_confidence: dateConfidence(job),
  };
}

const AI_MATCH_BATCH_SIZE = 20;

interface AiBatchMatch {
  job_id?: string;
  score?: number;
  matched_skills?: string[];
  missing_skills?: string[];
}

/**
 * Scores `jobs` via aiService.matchJobsBatch — the same semantic matcher
 * jobs.controller.ts uses for dashboard/recommended jobs — in chunks of
 * AI_MATCH_BATCH_SIZE so a full agent run makes a handful of AI calls
 * instead of one per job. Any chunk that fails (timeout, non-2xx, rate
 * limit) falls back to the lexical scorer for just that chunk's jobs,
 * tagged accordingly, rather than failing the whole run.
 */
async function scoreJobsWithAi(
  userId: string,
  resumeId: string,
  jobs: Job[],
  agent: SearchAgent,
  profile: CandidateProfileSummary,
): Promise<ScoredJob[]> {
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const results: ScoredJob[] = [];

  const fallbackFor = (job: Job) => ({
    ...scoreJobForAgentFallback(job, agent, profile),
    scoring_method: 'lexical_fallback' as const,
  });

  for (let i = 0; i < jobs.length; i += AI_MATCH_BATCH_SIZE) {
    const chunk = jobs.slice(i, i + AI_MATCH_BATCH_SIZE);

    try {
      const response = await aiService.matchJobsBatch(
        userId,
        resumeId,
        chunk.map((j) => j.id),
      );
      const matches = Array.isArray((response as { matches?: unknown })?.matches)
        ? ((response as { matches: AiBatchMatch[] }).matches)
        : [];

      const seen = new Set<string>();
      for (const match of matches) {
        const original = match.job_id ? jobById.get(match.job_id) : undefined;
        if (!original) continue;
        seen.add(original.id);
        results.push({
          ...original,
          match_score: Math.round(Number(match.score ?? 0)),
          matched_skills: match.matched_skills,
          missing_skills: match.missing_skills,
          scoring_method: 'ai',
          is_remote: isRemoteJob(original),
          date_confidence: dateConfidence(original),
        });
      }

      // The AI service may legitimately skip a job (e.g. it vanished
      // between search and scoring) — fall back for just those, not the
      // whole chunk, so one gap doesn't mask an otherwise-healthy AI call.
      for (const job of chunk) {
        if (!seen.has(job.id)) results.push(fallbackFor(job));
      }
    } catch (err) {
      console.error(
        '[runSearchAgent] AI batch scoring failed, falling back to lexical scorer for this batch:',
        (err as Error).message,
      );
      for (const job of chunk) results.push(fallbackFor(job));
    }
  }

  return results;
}

// ---------- agent_job_results (seen-jobs tracking) ----------
//
// Moved here from jobs/agentScheduler.ts: runSearchAgent() now needs this
// table directly (to compute a true new_jobs_count instead of just
// scored.length — see below), not only the cron scheduler, so this is the
// more robust home for it. agentScheduler.ts imports both from here.

let agentJobResultsBootstrap: Promise<void> | null = null;

export async function ensureAgentJobResultsTable(): Promise<void> {
  if (agentJobResultsBootstrap) {
    await agentJobResultsBootstrap;
    return;
  }

  agentJobResultsBootstrap = (async () => {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS agent_job_results (
         id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         agent_id   UUID NOT NULL REFERENCES search_agents(id) ON DELETE CASCADE,
         job_id     UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
         seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         UNIQUE(agent_id, job_id)
       )`,
    );
    await pool.query('CREATE INDEX IF NOT EXISTS idx_agent_job_results_agent ON agent_job_results(agent_id)');

    // Seen-tracking identity column: new_jobs_count depends on recognizing
    // "the same posting seen again" reliably, and the pre-existing
    // UNIQUE(agent_id, job_id) can't do that on its own — job_id is a real
    // FK to a specific jobs row (still needed as-is for email auto-apply,
    // which acts on one specific row's apply_email), not the semantic
    // identity two different rows might share. job_identity_key holds
    // jobIdentityKey(job) — the SAME function used for in-run cross-
    // source/cross-location dedup — so seen-tracking recognizes a posting
    // by identity, independent of which literal jobs.id row it landed on
    // this time. TEXT (unbounded) — the longest key shape is
    // "text:<company>|<title>", no practical width limit needed.
    await pool.query(`ALTER TABLE agent_job_results ADD COLUMN IF NOT EXISTS job_identity_key TEXT`);
    // Backfill existing rows via the tier-1 shape (source:external_id) —
    // covers effectively every real row, since every upsert* function in
    // jobSearch.service.ts always sets both fields. Anything that
    // genuinely can't resolve that falls back to the row's own job_id so
    // the column is never left NULL.
    await pool.query(`
      UPDATE agent_job_results ajr
      SET job_identity_key = COALESCE(
        (SELECT j.source || ':' || j.external_id
           FROM jobs j
          WHERE j.id = ajr.job_id AND j.source IS NOT NULL AND j.external_id IS NOT NULL),
        ajr.job_id::text
      )
      WHERE ajr.job_identity_key IS NULL
    `);
    await pool.query(`ALTER TABLE agent_job_results ALTER COLUMN job_identity_key SET NOT NULL`);
    // The real seen-tracking constraint: recordSeenJobs()'s ON CONFLICT
    // targets this, not the old UNIQUE(agent_id, job_id) (left in place,
    // still harmless/still true, just no longer what seen-tracking uses).
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_job_results_agent_identity
        ON agent_job_results(agent_id, job_identity_key)
    `);

    // Email auto-apply lifecycle columns. Mirrors
    // database/migrations/003_email_auto_apply.sql so a fresh install that
    // only ever boots the app (never runs the SQL migrations) still ends up
    // with the right shape. See that migration for the full rationale.
    await pool.query(`ALTER TABLE agent_job_results ADD COLUMN IF NOT EXISTS user_id       UUID REFERENCES users(id) ON DELETE CASCADE`);
    await pool.query(`ALTER TABLE agent_job_results ADD COLUMN IF NOT EXISTS apply_status  VARCHAR(20) NOT NULL DEFAULT 'matched'`);
    await pool.query(`ALTER TABLE agent_job_results ADD COLUMN IF NOT EXISTS message_id    TEXT`);
    await pool.query(`ALTER TABLE agent_job_results ADD COLUMN IF NOT EXISTS prepared_at   TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE agent_job_results ADD COLUMN IF NOT EXISTS sent_at       TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE agent_job_results ADD COLUMN IF NOT EXISTS bounced_at    TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE agent_job_results ADD COLUMN IF NOT EXISTS replied_at    TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE agent_job_results ADD COLUMN IF NOT EXISTS send_error    TEXT`);

    await pool.query(
      `UPDATE agent_job_results ajr
         SET user_id = sa.user_id
         FROM search_agents sa
        WHERE ajr.agent_id = sa.id AND ajr.user_id IS NULL`,
    );
    await pool.query(`ALTER TABLE agent_job_results ALTER COLUMN user_id SET NOT NULL`);

    await pool.query(`
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
      $$
    `);

    await pool.query('CREATE INDEX IF NOT EXISTS idx_agent_job_results_user_id ON agent_job_results(user_id)');
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_job_results_user_job_committed
        ON agent_job_results(user_id, job_id)
        WHERE apply_status IN ('prepared', 'sent', 'bounced', 'replied')
    `);

    await pool.query(
      `CREATE TABLE IF NOT EXISTS auto_apply_send_log (
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
       )`,
    );
    await pool.query('CREATE INDEX IF NOT EXISTS idx_auto_apply_send_log_user_id ON auto_apply_send_log(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_auto_apply_send_log_job_id ON auto_apply_send_log(job_id)');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_auto_apply_send_log_user_created
        ON auto_apply_send_log(user_id, created_at)
        WHERE dry_run = FALSE AND success = TRUE
    `);

    await pool.query(
      `CREATE TABLE IF NOT EXISTS user_auto_apply_settings (
         id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
         user_id               UUID         NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
         enabled               BOOLEAN      NOT NULL DEFAULT FALSE,
         min_match_threshold   SMALLINT     NOT NULL DEFAULT 80 CHECK (min_match_threshold BETWEEN 0 AND 100),
         daily_send_cap        SMALLINT     NOT NULL DEFAULT 10 CHECK (daily_send_cap BETWEEN 1 AND 100),
         dry_run               BOOLEAN      NOT NULL DEFAULT TRUE,
         reviewed_first_send   BOOLEAN      NOT NULL DEFAULT FALSE,
         created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
         updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
       )`,
    );
    await pool.query('CREATE INDEX IF NOT EXISTS idx_user_auto_apply_settings_user_id ON user_auto_apply_settings(user_id)');
  })();

  try {
    await agentJobResultsBootstrap;
  } catch (err) {
    agentJobResultsBootstrap = null;
    throw err;
  }
}

/**
 * Records which jobs an agent's run actually surfaced, deduped against
 * every prior run for that agent by IDENTITY, not by raw job_id — see
 * jobIdentityKey() for why: the same real posting can land under a
 * different jobs.id row between runs (re-scraped, slightly different
 * external_id, etc.), and a job_id-only comparison would have missed that,
 * counting it as "new" again. This calls the exact same jobIdentityKey()
 * used for in-run cross-source and cross-location dedup — that's the
 * invariant that makes new_jobs_count trustworthy: in-run dedup key ==
 * seen-tracking key, always, because it's literally the same function call.
 *
 * Returns the count of rows that were genuinely new — the ON CONFLICT DO
 * NOTHING / RETURNING pattern is the only reliable way to get that count,
 * since the shared query() helper only ever returns `result.rows` (see
 * config/database.ts), not rowCount.
 */
export async function recordSeenJobs(agentId: string, userId: string, jobs: Job[]): Promise<number> {
  if (jobs.length === 0) return 0;
  await ensureAgentJobResultsTable();

  // Defensive de-dup on the way in — callers are documented to already
  // hand over an identity-deduped list (jobSearchService.search()'s merge
  // step), but a single bad INSERT VALUES batch with two rows sharing a
  // conflict target would fail outright rather than just skip the dupe.
  const seen = new Set<string>();
  const rows: Array<{ jobId: string; identityKey: string }> = [];
  for (const job of jobs) {
    const identityKey = jobIdentityKey(job);
    if (seen.has(identityKey)) continue;
    seen.add(identityKey);
    rows.push({ jobId: job.id, identityKey });
  }
  if (rows.length === 0) return 0;

  const placeholders = rows.map((_, i) => `($1, $2, $${i * 2 + 3}, $${i * 2 + 4})`).join(', ');
  const params = [agentId, userId, ...rows.flatMap((r) => [r.jobId, r.identityKey])];

  const inserted = await query<{ job_identity_key: string }>(
    `INSERT INTO agent_job_results (agent_id, user_id, job_id, job_identity_key)
     VALUES ${placeholders}
     ON CONFLICT (agent_id, job_identity_key) DO NOTHING
     RETURNING job_identity_key`,
    params,
  );

  return inserted.length;
}

export async function runSearchAgent(
  userId: string,
  agentId: string,
): Promise<RunSearchAgentResult | null> {
  await ensureSearchAgentTables();
  const agent = await getSearchAgent(userId, agentId);
  if (!agent) return null;

  // Mark as in-flight for the duration of the run — set here (not just by
  // the create controller) so this is accurate for every invocation path:
  // manual "run now", the cron scheduler's periodic re-runs, and the
  // async-create queue worker alike.
  await updateSearchAgentStatus(userId, agentId, 'searching');

  try {
    return await runSearchAgentInner(userId, agentId, agent);
  } catch (err) {
    // Whichever caller invoked this (manual run, cron scheduler, or the
    // queue worker) sees the agent left at 'error' rather than stuck at
    // 'searching' forever — set here so it's guaranteed regardless of
    // invocation path, not just the queue worker's own catch.
    await updateSearchAgentStatus(userId, agentId, 'error').catch((updateErr) =>
      console.error('[runSearchAgent] failed to record error status:', updateErr),
    );
    throw err;
  }
}

async function runSearchAgentInner(
  userId: string,
  agentId: string,
  agent: SearchAgent,
): Promise<RunSearchAgentResult> {
  const profile = await getCandidateProfileSummary(userId);

  // Build a query from the agent's targets; fall back to its name. Each
  // title is sanitized (whitespace collapsed/trimmed) before it ever
  // reaches a source query — see sanitizeTitleForQuery.
  const query_text =
    agent.target_titles.map(sanitizeTitleForQuery).join(' OR ') ||
    profile.preferred_roles?.map(sanitizeTitleForQuery).join(' OR ') ||
    agent.name;

  let userSearchApiKey: string | undefined;
  const userRows = await query<{ search_api_key?: string | null }>(
    `SELECT search_api_key FROM users WHERE id = $1`,
    [userId],
  );
  userSearchApiKey = userRows[0]?.search_api_key ?? undefined;

  // Search every configured location, not just the first — a multi-location
  // agent used to silently only ever search agent.preferred_locations[0].
  // Capped to bound cost (each location is a full multi-source fan-out:
  // SerpAPI + 4 free APIs + a LinkedIn scrape). undefined = "no location
  // filter", preserving the previous behavior for agents with none set.
  const locationsToSearch: Array<string | undefined> =
    agent.preferred_locations.length > 0
      ? agent.preferred_locations.slice(0, MAX_AGENT_SEARCH_LOCATIONS)
      : [undefined];

  const passes: Array<{ label: string; location?: string; remoteOnly: boolean; sources: string[] }> =
    locationsToSearch.map((location) => ({
      label: location ?? '(none)',
      location,
      // Location-scoped passes are constrained by LOCATION only, never by
      // the remote flag — this used to be `agent.work_modes.includes(
      // 'remote')`, which meant an agent with BOTH a concrete location
      // (e.g. Riyadh) AND 'remote' selected got remoteOnly:true on its
      // Riyadh pass too. That disables the free-API post-fetch location
      // filter entirely (see searchFreeApis), which is exactly how
      // out-of-region jobs — a US "Engineer III" listing in Austin, TX —
      // ended up in a Riyadh-only search. Remote coverage is handled
      // exclusively by the dedicated worldwide-remote pass appended below.
      remoteOnly: false,
      sources: agent.source_preferences,
    }));

  // Worldwide remote rule: remote is now a first-class default, not
  // conditional on the agent having explicitly selected 'remote' as a work
  // mode. This pass always runs UNLESS the agent has set itself to
  // onsite-only — work_modes is non-empty and every entry is 'onsite',
  // meaning the user explicitly and exclusively asked for on-site roles.
  // An agent with no work_modes set at all (no preference expressed) or
  // with 'hybrid'/'remote' anywhere in the mix still gets this pass; only
  // an unambiguous, exclusive onsite choice opts out.
  const onsiteOnly = agent.work_modes.length > 0 && agent.work_modes.every((mode) => mode === 'onsite');
  if (!onsiteOnly) {
    // Never SerpAPI/LinkedIn — those stay location-scoped to avoid flooding
    // results and blowing up AI-scoring cost on jobs the agent never asked
    // to see beyond its configured locations. Respects the agent's own
    // source_preferences: if it deselected all four, there's nothing to
    // run here.
    const worldwideSources = agent.source_preferences.filter((s) => REMOTE_FRIENDLY_SOURCES.includes(s));
    if (worldwideSources.length > 0) {
      passes.push({ label: '(worldwide-remote)', location: undefined, remoteOnly: true, sources: worldwideSources });
    }
  }

  const passResults = await Promise.allSettled(
    passes.map((pass) =>
      jobSearchService.search({
        query: query_text,
        location: pass.location,
        page: 1,
        remoteOnly: pass.remoteOnly,
        apiKey: userSearchApiKey,
        sources: pass.sources,
        seniority: agent.seniority,
        maxAgeDays: agent.max_age_days,
      }),
    ),
  );

  const jobs: Job[] = [];
  const seenJobs = new Set<string>();
  const sourceStatusByPass: SourceStatus[][] = [];
  passResults.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(
        `[runSearchAgent] search failed for ${passes[i].label}:`,
        (result.reason as Error)?.message ?? result.reason,
      );
      return;
    }
    const pass = passes[i];
    const isRemoteSemanticPass =
      pass.label === '(worldwide-remote)' ||
      (pass.location ? REMOTE_LOCATION_STRINGS.has(pass.location.toLowerCase().trim()) : false);

    let passJobs = result.value.jobs;
    if (isRemoteSemanticPass) {
      const beforeCount = passJobs.length;
      passJobs = passJobs.filter((job) => isGenericRemoteLocation(job.location));
      console.log(
        `[runSearchAgent] pass "${pass.label}" remote-semantic location filter: ${beforeCount} -> ${passJobs.length}`,
      );
    }

    console.log(`[runSearchAgent] pass "${pass.label}" (remoteOnly=${pass.remoteOnly}): ${passJobs.length} job(s)`);
    for (const job of passJobs) {
      const key = jobIdentityKey(job);
      if (seenJobs.has(key)) continue;
      seenJobs.add(key);
      jobs.push(job);
    }
    sourceStatusByPass.push(result.value.sourceStatus);
  });
  const sourceStatus = mergeSourceStatuses(sourceStatusByPass);

  // Hard filters apply before scoring, independent of which scorer produces
  // the percentage below: the agent's own exclude-keyword/blacklisted-
  // company rules, the seniority filter (see seniorityVerdict) for jobs
  // whose title gives an unambiguous signal two or more ranks outside the
  // agent's selected range, and the recency filter (see isWithinRecency)
  // for jobs older than agent.max_age_days. This is the step that
  // guarantees the corpus is level-, exclusion-, AND recency-appropriate
  // BEFORE scoring — not just down-ranked after — so AI-scoring budget is
  // never spent on a stale posting. Each count below is exclusive of
  // whatever a prior filter already dropped, so the three numbers sum to
  // the total dropped rather than double-counting a job caught by more
  // than one rule.
  const passesSeniority = (job: Job) => seniorityVerdict(job.title, agent.seniority) !== 'drop';
  const seniorityDroppedCount = jobs.filter((job) => !passesSeniority(job)).length;
  const excludeBlacklistDroppedCount = jobs.filter(
    (job) => passesSeniority(job) && isHardExcluded(job, agent),
  ).length;
  const recencyDroppedCount = jobs.filter(
    (job) => passesSeniority(job) && !isHardExcluded(job, agent) && !isWithinRecency(job, agent.max_age_days),
  ).length;
  const eligibleJobs = jobs.filter(
    (job) => passesSeniority(job) && !isHardExcluded(job, agent) && isWithinRecency(job, agent.max_age_days),
  );
  const unknownDateCount = eligibleJobs.filter((job) => dateConfidence(job) === 'unknown').length;
  console.log(
    `[runSearchAgent] corpus: ${jobs.length} merged -> ${eligibleJobs.length} eligible ` +
      `(dropped: seniority=${seniorityDroppedCount}, exclude/blacklist=${excludeBlacklistDroppedCount}, ` +
      `recency>${agent.max_age_days}d=${recencyDroppedCount}; of eligible, ${unknownDateCount} have no known posted date)`,
  );

  let scoredRaw: ScoredJob[];
  if (profile.resume_id) {
    scoredRaw = await scoreJobsWithAi(userId, profile.resume_id, eligibleJobs, agent, profile);
  } else {
    // No resume on file at all — the AI matcher requires a resume_id and
    // would just 400. Same "AI matching unavailable" situation as a
    // service outage, so it gets the same labeled fallback treatment.
    console.warn(`[runSearchAgent] user ${userId} has no resume; using lexical fallback scorer.`);
    scoredRaw = eligibleJobs.map((job) => ({
      ...scoreJobForAgentFallback(job, agent, profile),
      scoring_method: 'lexical_fallback' as const,
    }));
  }

  // Post-scoring adjustments, applied uniformly regardless of which scorer
  // produced the base score:
  //  - Soft seniority penalty: jobs one rank outside the agent's range
  //    (e.g. a "mid" title for an intern/junior agent) survive the hard
  //    drop above but still get down-ranked here, rather than competing on
  //    the raw score a same-title-level job would earn.
  //  - Remote ranking boost: a small additive nudge (never a hard filter —
  //    non-remote jobs are never dropped) so remote roles surface near the
  //    top without being able to outrank a genuinely stronger onsite match.
  const adjusted = scoredRaw.map((job) => {
    let match_score = job.match_score;
    if (seniorityVerdict(job.title, agent.seniority) === 'penalize') {
      match_score = Math.max(0, match_score - SENIORITY_PENALTY_SCORE_DELTA);
    }
    if (job.is_remote) {
      match_score = Math.min(100, match_score + REMOTE_BOOST_SCORE_DELTA);
    }
    return { ...job, match_score };
  });

  const scored = adjusted
    .filter((job) => job.match_score > 0)
    .sort((a, b) => b.match_score - a.match_score);

  // True "new jobs" count: rows actually inserted into agent_job_results
  // for this agent, not scored.length. A job that showed up again in this
  // run because it's still live (already recorded in a prior run) doesn't
  // count as new.
  const newJobsCount = await recordSeenJobs(
    agentId,
    userId,
    scored,
  );

  // Average only over AI-scored jobs so a partial AI outage this run
  // doesn't skew the average with the fallback scorer's much cruder
  // numbers; if literally everything fell back (AI matcher fully down),
  // average over what we have rather than report a misleading 0.
  const aiScored = scored.filter((j) => j.scoring_method === 'ai');
  const scoringDegraded = scored.some((j) => j.scoring_method === 'lexical_fallback');
  const scoresForAverage = aiScored.length > 0 ? aiScored : scored;
  const avgMatchScore =
    scoresForAverage.length > 0
      ? Math.round(scoresForAverage.reduce((sum, j) => sum + j.match_score, 0) / scoresForAverage.length)
      : 0;

  const rows = await query<SearchAgentRow>(
    `UPDATE search_agents
        SET new_jobs_count = $1,
            avg_match_score = $2,
            status = 'ready',
            last_run_at = NOW(),
            updated_at = NOW()
      WHERE id = $3 AND user_id = $4
      RETURNING
        id, user_id, name, target_titles, seniority, preferred_locations, work_modes,
        industries, company_sizes, max_age_days,
        include_keywords, exclude_keywords, blacklist_companies, source_preferences,
        active, status, last_run_at, new_jobs_count, avg_match_score, created_at, updated_at`,
    [newJobsCount, avgMatchScore, agentId, userId],
  );

  const updated = rows[0] ? mapSearchAgent(rows[0]) : agent;

  return {
    agent: updated,
    jobs: scored,
    new_jobs_count: newJobsCount,
    avg_match_score: avgMatchScore,
    scoring_degraded: scoringDegraded,
    source_status: sourceStatus,
  };
}
