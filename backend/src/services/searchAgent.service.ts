import { randomUUID } from 'crypto';
import { pool, query } from '../config/database';
import { jobSearchService } from './jobSearch.service';
import {
  CandidateProfileSummary,
  Job,
  ParsedResumeData,
  Resume,
  SearchAgent,
  SearchAgentCompanySize,
  SearchAgentInput,
  SearchAgentQueryPlan,
  SearchAgentQueryPlanSource,
  SearchAgentSalaryExpectation,
  SearchAgentSeniority,
  SearchAgentWorkMode,
} from '../types';

const DEFAULT_SOURCE_PREFERENCES = ['linkedin', 'company_careers', 'greenhouse', 'lever', 'ashby'];

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
  salary_amount: number | null;
  salary_currency: string | null;
  salary_period: 'monthly' | 'yearly' | null;
  include_keywords: string[] | null;
  exclude_keywords: string[] | null;
  blacklist_companies: string[] | null;
  source_preferences: string[] | null;
  active: boolean;
  last_run_at: Date | null;
  new_jobs_count: number | null;
  avg_match_score: number | string | null;
  created_at: Date;
  updated_at: Date;
};

type SearchAgentWriteShape = Omit<SearchAgentInput, 'salary_expectation' | 'active'> & {
  salary_expectation: SearchAgentSalaryExpectation;
  active: boolean;
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

function normalizeScalar(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
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
    salary_expectation: {
      amount: row.salary_amount,
      currency: row.salary_currency,
      period: row.salary_period ?? 'monthly',
    },
    include_keywords: normalizeList(row.include_keywords),
    exclude_keywords: normalizeList(row.exclude_keywords),
    blacklist_companies: normalizeList(row.blacklist_companies),
    source_preferences: sourcePreferences.length > 0 ? sourcePreferences : [...DEFAULT_SOURCE_PREFERENCES],
    active: row.active,
    last_run_at: row.last_run_at,
    new_jobs_count: row.new_jobs_count ?? 0,
    avg_match_score: Number(row.avg_match_score ?? 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toWriteShape(input: SearchAgentInput & { active?: boolean }): SearchAgentWriteShape {
  return {
    name: input.name.trim(),
    target_titles: normalizeList(input.target_titles),
    seniority: [...new Set(input.seniority ?? [])] as SearchAgentSeniority[],
    preferred_locations: normalizeList(input.preferred_locations),
    work_modes: [...new Set(input.work_modes ?? [])] as SearchAgentWorkMode[],
    industries: normalizeList(input.industries),
    company_sizes: [...new Set(input.company_sizes ?? [])] as SearchAgentCompanySize[],
    salary_expectation: {
      amount: input.salary_expectation?.amount ?? null,
      currency: normalizeScalar(input.salary_expectation?.currency),
      period: input.salary_expectation?.period ?? 'monthly',
    },
    include_keywords: normalizeList(input.include_keywords),
    exclude_keywords: normalizeList(input.exclude_keywords),
    blacklist_companies: normalizeList(input.blacklist_companies),
    source_preferences: normalizeList(input.source_preferences).length
      ? normalizeList(input.source_preferences)
      : [...DEFAULT_SOURCE_PREFERENCES],
    active: input.active ?? true,
  };
}

function toInput(agent: SearchAgent): SearchAgentInput & { active?: boolean } {
  return {
    name: agent.name,
    target_titles: agent.target_titles,
    seniority: agent.seniority,
    preferred_locations: agent.preferred_locations,
    work_modes: agent.work_modes,
    industries: agent.industries,
    company_sizes: agent.company_sizes,
    salary_expectation: agent.salary_expectation,
    include_keywords: agent.include_keywords,
    exclude_keywords: agent.exclude_keywords,
    blacklist_companies: agent.blacklist_companies,
    source_preferences: agent.source_preferences,
    active: agent.active,
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
       salary_amount,
       salary_currency,
       salary_period,
       include_keywords,
       exclude_keywords,
       blacklist_companies,
       source_preferences,
       active,
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

function buildCanonicalQuery(agent: SearchAgent, profile: CandidateProfileSummary): string {
  const titleClause =
    agent.target_titles.length > 0 ? `(${agent.target_titles.join(' OR ')})` : '';
  const supplementalTerms = normalizeList([
    ...agent.include_keywords,
    ...profile.preferred_roles.slice(0, 2),
    ...profile.skills.slice(0, 4),
  ]).filter((term) => !agent.target_titles.includes(term));
  const negativeTerms = agent.exclude_keywords.map((term) => `-${term}`);
  const remoteTerms = agent.work_modes.includes('remote') ? ['remote'] : [];

  return [titleClause, ...supplementalTerms, ...remoteTerms, ...negativeTerms]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function buildSourcePlan(
  source: string,
  agent: SearchAgent,
  profile: CandidateProfileSummary,
  canonicalQuery: string,
): SearchAgentQueryPlanSource {
  const fallbackLocations =
    agent.preferred_locations.length > 0 ? agent.preferred_locations : profile.preferred_locations;
  const fallbackSeniority =
    agent.seniority.length > 0
      ? agent.seniority
      : profile.inferred_seniority
        ? [profile.inferred_seniority]
        : [];

  const sharedFilters = {
    titles: agent.target_titles,
    locations: fallbackLocations,
    work_modes: agent.work_modes,
    seniority: fallbackSeniority,
    industries: agent.industries,
    company_sizes: agent.company_sizes,
    salary_expectation: agent.salary_expectation,
  };

  const sourceStrategies: Record<string, { strategy: string; crawl_hints: string[] }> = {
    linkedin: {
      strategy: 'Run keyword search with title OR include-keyword matching, then apply native LinkedIn location, remote, and seniority filters.',
      crawl_hints: ['easy apply', 'posted in last 24 hours', 'same title variants'],
    },
    company_careers: {
      strategy: 'Search company career pages using normalized titles and include keywords, then prioritize pages with careers/jobs/join-us patterns.',
      crawl_hints: ['careers', 'jobs', 'join-us', 'work-with-us'],
    },
    greenhouse: {
      strategy: 'Query Greenhouse job boards by normalized title keywords, then filter by location, remote language, and description skill overlap.',
      crawl_hints: ['greenhouse.io', 'boards.greenhouse.io'],
    },
    lever: {
      strategy: 'Query Lever postings using normalized titles and include keywords, then rank by skill overlap and remote-friendly wording.',
      crawl_hints: ['jobs.lever.co', 'lever.co'],
    },
    ashby: {
      strategy: 'Query Ashby openings with normalized titles and keyword filters, then use structured office location and remote metadata when available.',
      crawl_hints: ['jobs.ashbyhq.com', 'ashbyhq.com'],
    },
  };

  const defaults = sourceStrategies[source] ?? {
    strategy: 'Run the canonical query against the source connector and apply shared agent filters.',
    crawl_hints: ['careers', 'jobs'],
  };

  return {
    source,
    search_text: canonicalQuery,
    filters: sharedFilters,
    strategy: defaults.strategy,
    crawl_hints: defaults.crawl_hints,
  };
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
        salary_amount INTEGER,
        salary_currency VARCHAR(10),
        salary_period VARCHAR(20) NOT NULL DEFAULT 'monthly',
        include_keywords TEXT[] NOT NULL DEFAULT '{}'::text[],
        exclude_keywords TEXT[] NOT NULL DEFAULT '{}'::text[],
        blacklist_companies TEXT[] NOT NULL DEFAULT '{}'::text[],
        source_preferences TEXT[] NOT NULL DEFAULT ARRAY['linkedin', 'company_careers', 'greenhouse', 'lever', 'ashby']::text[],
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
       salary_amount,
       salary_currency,
       salary_period,
       include_keywords,
       exclude_keywords,
       blacklist_companies,
       source_preferences,
       active,
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
  input: SearchAgentInput & { active?: boolean },
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
       salary_amount,
       salary_currency,
       salary_period,
       include_keywords,
       exclude_keywords,
       blacklist_companies,
       source_preferences,
       active
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
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
       salary_amount,
       salary_currency,
       salary_period,
       include_keywords,
       exclude_keywords,
       blacklist_companies,
       source_preferences,
       active,
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
      payload.salary_expectation.amount,
      payload.salary_expectation.currency,
      payload.salary_expectation.period,
      payload.include_keywords,
      payload.exclude_keywords,
      payload.blacklist_companies,
      payload.source_preferences,
      payload.active,
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
    salary_expectation: input.salary_expectation ?? existing.salary_expectation,
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
       salary_amount = $8,
       salary_currency = $9,
       salary_period = $10,
       include_keywords = $11,
       exclude_keywords = $12,
       blacklist_companies = $13,
       source_preferences = $14,
       active = $15,
       updated_at = NOW()
     WHERE id = $16 AND user_id = $17
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
       salary_amount,
       salary_currency,
       salary_period,
       include_keywords,
       exclude_keywords,
       blacklist_companies,
       source_preferences,
       active,
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
      merged.salary_expectation.amount,
      merged.salary_expectation.currency,
      merged.salary_expectation.period,
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

export function buildSearchAgentQueryPlan(
  agent: SearchAgent,
  profile: CandidateProfileSummary,
): SearchAgentQueryPlan {
  const canonicalQuery = buildCanonicalQuery(agent, profile);

  return {
    agent_id: agent.id,
    generated_at: new Date(),
    canonical_query: canonicalQuery,
    hard_filters: {
      exclude_keywords: agent.exclude_keywords,
      blacklist_companies: agent.blacklist_companies,
    },
    sources: agent.source_preferences.map((source) =>
      buildSourcePlan(source, agent, profile, canonicalQuery),
    ),
  };
}

// ---------- Search agent execution ----------

export interface ScoredJob extends Job {
  match_score: number;
  matched_skills?: string[];
  missing_skills?: string[];
}

export interface RunSearchAgentResult {
  agent: SearchAgent;
  jobs: ScoredJob[];
  new_jobs_count: number;
  avg_match_score: number;
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

function scoreJobForAgent(
  job: Job,
  agent: SearchAgent,
  profile: CandidateProfileSummary,
): ScoredJob {
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

  // Hard filters: exclude keywords and blacklisted companies drop the score to 0.
  const excludeHit = agent.exclude_keywords.some((keyword) => {
    const tokens = tokenize(keyword);
    return Array.from(tokens).some((token) => haystack.has(token));
  });
  const companyBlacklisted =
    job.company != null &&
    agent.blacklist_companies.some(
      (blocked) => blocked.toLowerCase().trim() === job.company!.toLowerCase().trim(),
    );
  if (excludeHit || companyBlacklisted) {
    return { ...job, match_score: 0, matched_skills: matchedSkills, missing_skills: missingSkills };
  }

  // Location soft boost.
  let locationBoost = 0;
  if (job.location && agent.preferred_locations.length > 0) {
    const loc = job.location.toLowerCase();
    if (agent.preferred_locations.some((pl) => loc.includes(pl.toLowerCase()))) {
      locationBoost = 0.1;
    }
  }
  if (agent.work_modes.includes('remote') && /remote|عن بعد/i.test(job.location ?? '')) {
    locationBoost = Math.max(locationBoost, 0.1);
  }

  const rawScore = titleRatio * 0.5 + skillRatio * 0.35 + includeRatio * 0.15 + locationBoost;
  const match_score = Math.round(Math.max(0, Math.min(1, rawScore)) * 100);

  return { ...job, match_score, matched_skills: matchedSkills, missing_skills: missingSkills };
}

export async function runSearchAgent(
  userId: string,
  agentId: string,
): Promise<RunSearchAgentResult | null> {
  await ensureSearchAgentTables();
  const agent = await getSearchAgent(userId, agentId);
  if (!agent) return null;

  const profile = await getCandidateProfileSummary(userId);

  // Build a query from the agent's targets; fall back to its name.
  const query_text =
    agent.target_titles.join(' OR ') ||
    profile.preferred_roles?.join(' OR ') ||
    agent.name;
  const location = agent.preferred_locations[0];
  const remoteOnly = agent.work_modes.includes('remote');

  let userSearchApiKey: string | undefined;
  const userRows = await query<{ search_api_key?: string | null }>(
    `SELECT search_api_key FROM users WHERE id = $1`,
    [userId],
  );
  userSearchApiKey = userRows[0]?.search_api_key ?? undefined;

  let jobs: Job[] = [];
  try {
    const result = await jobSearchService.search({
      query: query_text,
      location,
      page: 1,
      remoteOnly,
      apiKey: userSearchApiKey,
    });
    jobs = result.jobs;
  } catch (err) {
    console.error('[runSearchAgent] search failed:', (err as Error).message);
    jobs = [];
  }

  const scored = jobs
    .map((job) => scoreJobForAgent(job, agent, profile))
    .filter((job) => job.match_score > 0)
    .sort((a, b) => b.match_score - a.match_score);

  const newJobsCount = scored.length;
  const avgMatchScore =
    scored.length > 0
      ? Math.round(scored.reduce((sum, j) => sum + j.match_score, 0) / scored.length)
      : 0;

  const rows = await query<SearchAgentRow>(
    `UPDATE search_agents
        SET new_jobs_count = $1,
            avg_match_score = $2,
            last_run_at = NOW(),
            updated_at = NOW()
      WHERE id = $3 AND user_id = $4
      RETURNING
        id, user_id, name, target_titles, seniority, preferred_locations, work_modes,
        industries, company_sizes, salary_amount, salary_currency, salary_period,
        include_keywords, exclude_keywords, blacklist_companies, source_preferences,
        active, last_run_at, new_jobs_count, avg_match_score, created_at, updated_at`,
    [newJobsCount, avgMatchScore, agentId, userId],
  );

  const updated = rows[0] ? mapSearchAgent(rows[0]) : agent;

  return {
    agent: updated,
    jobs: scored,
    new_jobs_count: newJobsCount,
    avg_match_score: avgMatchScore,
  };
}
