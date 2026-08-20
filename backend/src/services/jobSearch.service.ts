import axios from 'axios';
import { randomUUID } from 'crypto';
import { config } from '../config';
import { query } from '../config/database';
import { Job } from '../types';
import { extractApplyEmail } from '../utils/extractApplyEmail';
import { parseJobPostedDate } from '../utils/parseJobPostedDate';

// ---------------------------------------------------------------------------
// SerpAPI Google Jobs types
// ---------------------------------------------------------------------------

interface SerpApplyOption {
  title: string;
  link: string;
}

interface SerpDetectedExtensions {
  posted_at?: string;
  schedule_type?: string;
  salary?: string;
  work_from_home?: boolean;
}

interface SerpJob {
  title: string;
  company_name: string;
  location: string;
  via: string;
  description: string;
  share_link?: string;
  thumbnail?: string;
  extensions?: string[];
  detected_extensions?: SerpDetectedExtensions;
  apply_options?: SerpApplyOption[];
  source_link?: string;
  job_id: string;
}

interface SerpResponse {
  jobs_results?: SerpJob[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Remotive types
// ---------------------------------------------------------------------------

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  company_logo_url: string | null;
  category: string;
  tags: string[];
  job_type: string;
  candidate_required_location: string;
  salary: string;
  description: string;
  /** ISO-shaped, no timezone suffix (e.g. "2026-08-14T20:33:39") — see
   * parseJobPostedDate()'s UTC-assumption handling for that shape. */
  publication_date?: string;
}

// ---------------------------------------------------------------------------
// RemoteOK types — https://remoteok.com/api
// ---------------------------------------------------------------------------

interface RemoteOkJob {
  id?: string;
  slug?: string;
  company?: string;
  company_logo?: string;
  position?: string;
  tags?: string[];
  description?: string;
  location?: string;
  salary_min?: number;
  salary_max?: number;
  apply_url?: string;
  url?: string;
  /** ISO with explicit offset (e.g. "2026-08-15T01:20:47+00:00"). Prefer
   * `epoch` when present — unambiguous, no string-parsing needed. */
  date?: string;
  /** Unix seconds. */
  epoch?: number;
}

// ---------------------------------------------------------------------------
// Arbeitnow types — https://www.arbeitnow.com/api/job-board-api
// ---------------------------------------------------------------------------

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  tags: string[];
  job_types: string[];
  location: string;
  created_at: number;
}

// ---------------------------------------------------------------------------
// TheMuse types — https://www.themuse.com/api/public/jobs
// ---------------------------------------------------------------------------

interface MuseJob {
  id: number;
  name: string;
  contents: string;
  type: string;
  publication_date: string;
  company: { name: string };
  locations: Array<{ name: string }>;
  refs: { landing_page: string };
}

// ---------------------------------------------------------------------------
// LinkedIn guest-jobs (unofficial, unauthenticated HTML endpoint)
// https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search
// ---------------------------------------------------------------------------

interface LinkedInJob {
  jobId: string;
  title: string;
  company: string;
  location: string;
  applyUrl: string;
  description: string;
  postedAt?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapEmploymentType(ext?: SerpDetectedExtensions, extensions?: string[]): string {
  if (ext?.work_from_home) return 'عن بعد';
  const joined = (extensions ?? []).join(' ').toLowerCase();
  if (joined.includes('remote') || joined.includes('work from home')) return 'عن بعد';
  if (joined.includes('full-time') || joined.includes('full time')) return 'دوام كامل';
  if (joined.includes('part-time') || joined.includes('part time')) return 'دوام جزئي';
  if (joined.includes('contract') || joined.includes('contractor')) return 'عقد';
  if (joined.includes('intern')) return 'تدريب';
  return ext?.schedule_type === 'Full-time' ? 'دوام كامل' : 'دوام كامل';
}

// ---------------------------------------------------------------------------
// Job Search Service
// ---------------------------------------------------------------------------

/**
 * Source keys as exposed to callers (agent.source_preferences, the search-agent
 * builder UI, etc). "google_jobs" is the UI-facing name for the SerpAPI fetcher —
 * there is no source literally called "google_jobs" internally, so `wantsSource`
 * maps it explicitly.
 */
type SourceKey = 'google_jobs' | 'remotive' | 'remoteok' | 'arbeitnow' | 'themuse' | 'linkedin';

interface SearchParams {
  query: string;
  location?: string;
  page?: number;
  remoteOnly?: boolean;
  employmentType?: string;
  apiKey?: string;
  /** Restrict the fan-out to these sources. Absent/empty = search everything. */
  sources?: string[];
  /**
   * Agent seniority levels (SearchAgentSeniority[], typed as string[] here
   * to avoid a circular import with types.ts). Forwarded to LinkedIn's
   * guest-jobs f_E filter (the only source in this fan-out with a
   * server-side seniority param) — see SENIORITY_TO_LINKEDIN_EXPERIENCE.
   * Every source's results still go through the caller's own post-fetch
   * title-based seniority filter regardless of whether this was honored
   * server-side, since LinkedIn's 6-bucket scale is much coarser than ours.
   */
  seniority?: string[];
  /**
   * Recency cutoff in days (agent.max_age_days). Forwarded to the sources
   * that support a server-side date/recency param — SerpAPI/Google Jobs
   * (via the `chips` date_posted bucket) and LinkedIn (via f_TPR) — so
   * those two return fewer stale results in the first place, cheaper than
   * fetching-then-discarding. Every source's results still go through the
   * caller's own post-fetch, posted_at-based recency filter regardless
   * (see runSearchAgentInner), since neither of these is an exact filter:
   * SerpAPI only offers coarse buckets (today/week/month) and LinkedIn's
   * f_TPR, while exact, only narrows what SerpAPI/LinkedIn themselves
   * return — it does nothing for Remotive/RemoteOK/Arbeitnow/TheMuse.
   */
  maxAgeDays?: number;
}

/**
 * Maps our SearchAgentSeniority values onto LinkedIn's guest-jobs `f_E`
 * (experience level) filter codes: 1 Internship, 2 Entry level,
 * 3 Associate, 4 Mid-Senior level, 5 Director, 6 Executive. LinkedIn's
 * scale is much coarser than ours — several of our levels collapse onto the
 * same code, which is expected. This is a best-effort server-side
 * narrowing only; the definitive filter is the caller's post-fetch,
 * title-based seniority check, which applies uniformly regardless of
 * source.
 */
// Marks a job's OWN location text as a generic "could be anywhere" remote
// posting rather than a specific place. Used only by the worldwide-remote
// pass (see searchFreeApis) to keep region-restricted/onsite postings that
// merely got swept up by a remote-leaning source out of a location-agnostic
// search — e.g. a "Seattle, WA" listing has no such marker and is dropped.
const GENERIC_REMOTE_LOCATION_RE = /\b(remote|anywhere|worldwide|global|distributed|flexible|unspecified)\b/i;

export function isGenericRemoteLocation(location?: string | null): boolean {
  const trimmed = (location ?? '').trim();
  if (!trimmed) return true; // no location text at all — treat as unrestricted
  return GENERIC_REMOTE_LOCATION_RE.test(trimmed);
}

// Broader than GENERIC_REMOTE_LOCATION_RE (which only asks "does this
// LOCATION FIELD read as a generic anywhere-marker") — this is used to
// detect remote-ness anywhere it might be signaled (location, title, or
// description), since sources label it inconsistently: some set a real
// "remote" location string, some only mention it in the title, some only
// in body text ("100% remote", "fully distributed team", "work from
// home"). Deliberately does not include "flexible"/"unspecified" here
// (too weak a signal in a title/description context, unlike as a bare
// location value) or "global"/"worldwide" alone (common in company
// descriptions — "we serve customers worldwide" — without meaning the
// ROLE itself is remote).
// Unicode-aware boundaries (lookaround on \p{L}/\p{N}, with the `u` flag),
// NOT \b: JS's \b only recognizes ASCII [A-Za-z0-9_] as "word" characters,
// so a plain \b around the Arabic alternative (عن بعد) never matches at
// all — every character on both sides reads as "non-word" to \b, meaning
// no boundary ever fires inside an all-Arabic string. Confirmed by a
// dedicated regression test before this fix (isRemoteJob was silently
// blind to every Arabic-language "remote" listing).
const REMOTE_SIGNAL_RE =
  /(?<![\p{L}\p{N}])(remote|anywhere|distributed|work[\s-]?from[\s-]?home|wfh|100%\s*remote|fully\s*remote|telecommute|عن\s*بعد)(?![\p{L}\p{N}])/iu;

/**
 * Robust remote detection for the post-scoring ranking boost (see
 * runSearchAgentInner) and for tagging results so the UI can label them.
 * Checks, in order: the normalized employment_type marker every upsert*
 * function in this file already sets ('عن بعد') for sources that report
 * remote status structurally, then falls back to scanning location/title/
 * description text for an explicit remote signal — because plenty of
 * postings ARE remote without that structural marker (e.g. a SerpAPI/
 * Google Jobs result whose work_from_home flag wasn't set but whose title
 * says "Remote Backend Engineer").
 */
export function isRemoteJob(job: Pick<Job, 'employment_type' | 'location' | 'title' | 'description'>): boolean {
  if (job.employment_type === 'عن بعد') return true;
  if (job.location && REMOTE_SIGNAL_RE.test(job.location)) return true;
  if (job.title && REMOTE_SIGNAL_RE.test(job.title)) return true;
  // Description text only, capped — this is a signal scan, not a full-text
  // search, and descriptions can be thousands of characters.
  if (job.description && REMOTE_SIGNAL_RE.test(job.description.slice(0, 1000))) return true;
  return false;
}

const SENIORITY_TO_LINKEDIN_EXPERIENCE: Record<string, string> = {
  intern: '1',
  junior: '2',
  mid: '3',
  senior: '4',
  staff: '4',
  principal: '4',
  lead: '4',
  manager: '5',
  director: '5',
  vp: '6',
  c_level: '6',
};

/**
 * Per-source health for one search() call. 'ok' means the fetch completed
 * normally (zero jobs back is still 'ok' — that can be a genuine result).
 * 'error' means the fetch itself failed (network/HTTP error). 'degraded'
 * means the fetch nominally succeeded but something about the response
 * looks wrong — e.g. LinkedIn's guest endpoint returning a real HTML page
 * with zero parseable job cards, which is a strong signal of markup drift
 * or a rate-limit/block page rather than a genuine "no jobs" result.
 * Surfaced end-to-end through RunSearchAgentResult so the UI can show
 * "LinkedIn unavailable" instead of folding it into "no jobs found".
 */
export interface SourceStatus {
  source: string;
  status: 'ok' | 'degraded' | 'error';
  count: number;
  note?: string;
}

/** Builds a source-membership check. A null/empty selection means "search everything". */
function makeSourceFilter(sources?: string[]): (key: SourceKey) => boolean {
  const set = sources && sources.length > 0 ? new Set(sources) : null;
  return (key: SourceKey) => !set || set.has(key);
}

// Legal-entity suffixes stripped from company names before keying — "Acme
// Inc." and "Acme LLC" are the same employer, and left unstripped they
// fragment one company into several identity buckets.
const COMPANY_SUFFIX_RE =
  /\b(llc|inc|incorporated|ltd|limited|corp|corporation|co|company|gmbh|plc|llp|sa|srl|bv|nv|pty|pte)\b\.?/gi;

// Common abbreviation -> full-word normalizations applied per title token,
// so "Sr Backend Engineer" and "Senior Backend Engineer" collapse to the
// same key instead of being treated as two different postings.
const TITLE_WORD_ALIASES: Record<string, string> = {
  sr: 'senior',
  jr: 'junior',
  mgr: 'manager',
  dir: 'director',
  eng: 'engineer',
  devops: 'devops', // no-op entry kept for readability/extension
};

function normalizeCompanyForKey(company?: string | null): string {
  return (company ?? '')
    .normalize('NFKC') // canonicalize Unicode form first — mixed-script/Arabic
    // text can represent the same visible characters multiple ways; without
    // this, two byte-different-but-visually-identical strings would key
    // differently and fragment what's really one company/title.
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(COMPANY_SUFFIX_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTitleForKey(title?: string | null): string {
  return (title ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => TITLE_WORD_ALIASES[word] ?? word)
    .join(' ');
}

/**
 * Normalizes a job posting URL down to a stable identity fragment: lowercased
 * host with a leading "www." stripped, path with any trailing slash removed,
 * and the query string / fragment dropped entirely (tracking params like
 * ?utm_source=... would otherwise make the same posting look like a new one
 * every time it's re-fetched with different tracking noise attached).
 * Returns null for anything that doesn't parse as a URL.
 */
function normalizeApplyUrlForKey(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const path = parsed.pathname.replace(/\/+$/, '');
    return `${host}${path}`.toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * Same-job identity used everywhere a job needs to be recognized as "the
 * same posting": deduping across sources within one search() call, deduping
 * across the multiple locations a search agent fans out to in one run, and
 * (via agent_job_results) recognizing a posting seen in a prior run so
 * new_jobs_count only counts genuinely new ones. All three MUST use this
 * one function — if in-run dedup and cross-run seen-tracking ever compute
 * the key differently, new_jobs_count silently goes wrong again.
 *
 * Preference order:
 *  1. `${source}:${external_id}` — a source's own native ID is the most
 *     reliable identity available: stable across re-fetches, immune to
 *     title/company text drift between scrapes. This is the common case —
 *     every upsert* function in this file always sets both fields.
 *  2. `url:` + a normalized apply_url, when a source ever lacks a native ID.
 *  3. `text:` + normalized company + title, only as a last resort. This is
 *     the tier that used to be the ONLY strategy and is genuinely
 *     bug-prone: unnormalized text collides across trivial variations
 *     ("Sr" vs "Senior") and fragments what's really one company
 *     ("Acme Inc" vs "Acme LLC") into separate identities. Normalized here
 *     (NFKC + casefold + suffix/abbreviation stripping), but still the
 *     weakest signal — prefer tiers 1/2 whenever a source provides them.
 * The "url:"/"text:" prefixes on tiers 2/3 exist so they can never collide
 * with a tier-1 key — no real `source` value is literally "url" or "text".
 *
 * Note: preferring a source-native ID means two DIFFERENT sources carrying
 * the same real-world posting (e.g. cross-posted to both LinkedIn and
 * Remotive) are no longer merged into one identity — each source's ID
 * namespace is independent by construction. That's an accepted trade for
 * fixing the text-matching false-positive/fragmentation bugs; there's no
 * way to reliably correlate two independent sources' listings of "the same"
 * job without either a shared canonical ID (none exists) or exactly the
 * fuzzy text matching that caused the bug in the first place.
 */
export function jobIdentityKey(
  job: Pick<Job, 'company' | 'title' | 'source' | 'external_id' | 'apply_url'>,
): string {
  if (job.source && job.external_id) {
    return `${job.source}:${job.external_id}`;
  }

  const url = normalizeApplyUrlForKey(job.apply_url);
  if (url) {
    return `url:${url}`;
  }

  return `text:${normalizeCompanyForKey(job.company)}|${normalizeTitleForKey(job.title)}`;
}

class JobSearchService {
  /**
   * Search for jobs. Uses SerpAPI (Google Jobs) as primary source,
   * falls back to free APIs (Remotive) if SerpAPI is not configured.
   * When `params.sources` is provided, only those sources are queried;
   * when it's absent/undefined, every source is used (unchanged default
   * behavior for the dashboard's generic search).
   */
  async search(params: SearchParams): Promise<{ jobs: Job[]; total: number; sourceStatus: SourceStatus[] }> {
    const wantsSource = makeSourceFilter(params.sources);

    // Run Google Jobs (if configured and selected) and the free aggregator
    // (which internally gates each of its own sources) in parallel, then
    // merge + dedupe so results come from as many sources as possible.
    const tasks: Promise<{ jobs: Job[]; total: number; sourceStatus: SourceStatus[] }>[] = [
      this.searchFreeApis(params, wantsSource),
    ];
    if (wantsSource('google_jobs') && (params.apiKey || config.serpApiKey)) {
      tasks.unshift(
        this.searchSerpApi(params, wantsSource).catch((err) => {
          console.error('[SerpApi] failed, continuing with free sources:', (err as Error).message);
          return {
            jobs: [] as Job[],
            total: 0,
            sourceStatus: [{ source: 'google_jobs', status: 'error' as const, count: 0, note: (err as Error).message }],
          };
        }),
      );
    }

    const results = await Promise.all(tasks);

    const seen = new Set<string>();
    const merged: Job[] = [];
    const sourceStatus: SourceStatus[] = [];
    for (const r of results) {
      for (const job of r.jobs) {
        const key = jobIdentityKey(job);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(job);
      }
      sourceStatus.push(...r.sourceStatus);
    }

    return { jobs: merged, total: merged.length, sourceStatus };
  }

  // =========================================================================
  // SerpAPI — Google Jobs (primary)
  // =========================================================================

  private async searchSerpApi(
    params: SearchParams,
    wantsSource: (key: SourceKey) => boolean,
  ): Promise<{ jobs: Job[]; total: number; sourceStatus: SourceStatus[] }> {
    let q = params.query;

    const serpParams: Record<string, string> = {
      engine: 'google_jobs',
      q,
      api_key: params.apiKey ?? config.serpApiKey,
    };

    // Detect if location is "remote" / "عن بعد" and treat as remote filter
    const locationLower = (params.location ?? '').toLowerCase().trim();
    const isRemoteLocation = ['remote', 'عن بعد', 'remotely'].includes(locationLower);

    if (params.location && !isRemoteLocation) {
      serpParams.location = params.location;
    }

    if (params.remoteOnly || isRemoteLocation) {
      serpParams.ltype = '1'; // remote only filter
    }

    // chips — comma-separated, so employment_type and date_posted can
    // coexist in one request.
    const chips: string[] = [];
    if (params.employmentType) {
      const chipMap: Record<string, string> = {
        'دوام كامل': 'employment_type:FULLTIME',
        'دوام جزئي': 'employment_type:PARTTIME',
        'عقد': 'employment_type:CONTRACTOR',
        'تدريب': 'employment_type:INTERN',
      };
      if (chipMap[params.employmentType]) {
        chips.push(chipMap[params.employmentType]);
      }
    }
    // Recency, best-effort: SerpAPI/Google Jobs only exposes coarse
    // buckets (today/3days/week/month), not an arbitrary day count, so
    // this rounds DOWN to the tightest bucket that still covers
    // maxAgeDays — e.g. max_age_days=10 gets "month" (the closest bucket
    // ≥10 days), never "week" (which would under-fetch relative to what
    // the agent actually asked for). The exact cutoff is still enforced
    // by the post-fetch filter in runSearchAgentInner; this is purely a
    // cheaper-fetch optimization.
    if (params.maxAgeDays !== undefined) {
      const bucket =
        params.maxAgeDays <= 1 ? 'today' : params.maxAgeDays <= 3 ? '3days' : params.maxAgeDays <= 7 ? 'week' : params.maxAgeDays <= 30 ? 'month' : null;
      if (bucket) {
        chips.push(`date_posted:${bucket}`);
      }
    }
    if (chips.length > 0) {
      serpParams.chips = chips.join(',');
    }

    if (params.page && params.page > 1) {
      serpParams.start = String((params.page - 1) * 10);
    }

    let serpJobs: SerpJob[] = [];
    try {
      const { data } = await axios.get<SerpResponse>(
        'https://serpapi.com/search.json',
        { params: serpParams, timeout: 15_000 },
      );

      if (data.error) {
        console.error('SerpAPI error:', data.error);
        return this.withGoogleJobsError(params, wantsSource, data.error);
      }

      serpJobs = data.jobs_results ?? [];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('SerpAPI request failed:', msg);
      return this.withGoogleJobsError(params, wantsSource, msg);
    }
    const jobs: Job[] = [];

    for (const sJob of serpJobs) {
      jobs.push(await this.upsertSerpJob(sJob));
    }

    console.log(
      `[searchSerpApi] location="${params.location ?? '(none)'}" remoteOnly=${Boolean(params.remoteOnly)} ` +
        `maxAgeDays=${params.maxAgeDays ?? '(none)'} -> ${jobs.length} job(s)`,
    );

    return {
      jobs,
      total: jobs.length,
      sourceStatus: [{ source: 'google_jobs', status: 'ok', count: jobs.length }],
    };
  }

  /** SerpAPI failed — fall back to the free sources, but keep the google_jobs
   * failure visible instead of letting it disappear into the fallback's own
   * status array. */
  private async withGoogleJobsError(
    params: SearchParams,
    wantsSource: (key: SourceKey) => boolean,
    note: string,
  ): Promise<{ jobs: Job[]; total: number; sourceStatus: SourceStatus[] }> {
    const fallback = await this.searchFreeApis(params, wantsSource);
    return {
      ...fallback,
      sourceStatus: [{ source: 'google_jobs', status: 'error', count: 0, note }, ...fallback.sourceStatus],
    };
  }

  private async upsertSerpJob(sJob: SerpJob): Promise<Job> {
    const externalId = sJob.job_id;
    const source = 'google_jobs';

    const existing = await query<Job>(
      `SELECT id, source, external_id, title, normalized_title, company, location,
              description, salary_text, employment_type, apply_url, employer_logo, apply_email, posted_at, created_at
       FROM jobs WHERE source = $1 AND external_id = $2`,
      [source, externalId],
    );

    if (existing.length > 0) return existing[0];

    const id = randomUUID();
    const applyUrl =
      sJob.apply_options?.[0]?.link ?? sJob.source_link ?? sJob.share_link ?? null;
    const salary =
      sJob.detected_extensions?.salary ??
      (sJob.extensions ?? []).find((e) => e.includes('$') || e.includes('SAR') || e.includes('ريال')) ??
      null;
    const empType = mapEmploymentType(sJob.detected_extensions, sJob.extensions);
    const applyEmail = extractApplyEmail(sJob.title, sJob.description);
    const postedAt = parseJobPostedDate(sJob.detected_extensions?.posted_at);

    const rows = await query<Job>(
      `INSERT INTO jobs (id, source, external_id, title, normalized_title, company, location,
                         description, salary_text, employment_type, apply_url, employer_logo, apply_email, posted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (source, external_id) DO NOTHING
       RETURNING id, source, external_id, title, normalized_title, company, location,
                 description, salary_text, employment_type, apply_url, employer_logo, apply_email, posted_at, created_at`,
      [
        id, source, externalId,
        sJob.title,
        sJob.title.toLowerCase(),
        sJob.company_name,
        sJob.location,
        sJob.description?.slice(0, 5000) ?? '',
        salary,
        empType,
        applyUrl,
        sJob.thumbnail ?? null,
        applyEmail,
        postedAt,
      ],
    );

    return (
      rows[0] ?? ({
        id, source, external_id: externalId,
        title: sJob.title, company: sJob.company_name,
        location: sJob.location, description: sJob.description?.slice(0, 5000),
        salary_text: salary, employment_type: empType,
        apply_url: applyUrl, employer_logo: sJob.thumbnail ?? null,
        apply_email: applyEmail,
        posted_at: postedAt,
        created_at: new Date(),
      } as Job)
    );
  }

  // =========================================================================
  // Free APIs fallback (Remotive)
  // =========================================================================

  /**
   * Multi-source free aggregator. Fans out to Remotive, RemoteOK, Arbeitnow,
   * and TheMuse in parallel, merges, dedupes by (company, title), and applies
   * query + location filters on the results.
   */
  private async searchFreeApis(
    params: SearchParams,
    wantsSource: (key: SourceKey) => boolean,
  ): Promise<{ jobs: Job[]; total: number; sourceStatus: SourceStatus[] }> {
    const q = params.query.trim();
    const sourceStatus: SourceStatus[] = [];

    const [remotive, remoteOk, arbeitnow, muse, linkedin] = await Promise.all([
      wantsSource('remotive')
        ? this.fetchRemotive(q)
            .then((jobs) => {
              sourceStatus.push({ source: 'remotive', status: 'ok', count: jobs.length });
              return jobs;
            })
            .catch((err) => {
              console.error('[Remotive] fetch failed:', (err as Error).message);
              sourceStatus.push({ source: 'remotive', status: 'error', count: 0, note: (err as Error).message });
              return [] as RemotiveJob[];
            })
        : Promise.resolve([] as RemotiveJob[]),
      wantsSource('remoteok')
        ? this.fetchRemoteOk(q)
            .then((jobs) => {
              sourceStatus.push({ source: 'remoteok', status: 'ok', count: jobs.length });
              return jobs;
            })
            .catch((err) => {
              console.error('[RemoteOK] fetch failed:', (err as Error).message);
              sourceStatus.push({ source: 'remoteok', status: 'error', count: 0, note: (err as Error).message });
              return [] as RemoteOkJob[];
            })
        : Promise.resolve([] as RemoteOkJob[]),
      wantsSource('arbeitnow')
        ? this.fetchArbeitnow(q)
            .then((jobs) => {
              sourceStatus.push({ source: 'arbeitnow', status: 'ok', count: jobs.length });
              return jobs;
            })
            .catch((err) => {
              console.error('[Arbeitnow] fetch failed:', (err as Error).message);
              sourceStatus.push({ source: 'arbeitnow', status: 'error', count: 0, note: (err as Error).message });
              return [] as ArbeitnowJob[];
            })
        : Promise.resolve([] as ArbeitnowJob[]),
      wantsSource('themuse')
        ? this.fetchMuse(q, params.location)
            .then((jobs) => {
              sourceStatus.push({ source: 'themuse', status: 'ok', count: jobs.length });
              return jobs;
            })
            .catch((err) => {
              console.error('[TheMuse] fetch failed:', (err as Error).message);
              sourceStatus.push({ source: 'themuse', status: 'error', count: 0, note: (err as Error).message });
              return [] as MuseJob[];
            })
        : Promise.resolve([] as MuseJob[]),
      wantsSource('linkedin')
        ? this.fetchLinkedIn(q, params.location, params.remoteOnly, params.seniority, params.maxAgeDays)
            .then(({ jobs, status }) => {
              sourceStatus.push(status);
              return jobs;
            })
            .catch((err) => {
              console.error('[LinkedIn] fetch failed:', (err as Error).message);
              sourceStatus.push({ source: 'linkedin', status: 'error', count: 0, note: (err as Error).message });
              return [] as LinkedInJob[];
            })
        : Promise.resolve([] as LinkedInJob[]),
    ]);

    const collected: Job[] = [];
    // LinkedIn first so it wins (company|title) dedup ties — it generally
    // has the freshest, most-detailed listings.
    for (const j of linkedin) collected.push(await this.upsertLinkedInJob(j));
    for (const j of remotive) collected.push(await this.upsertRemotiveJob(j));
    for (const j of remoteOk) {
      const job = await this.upsertRemoteOkJob(j);
      if (job) collected.push(job);
    }
    for (const j of arbeitnow) collected.push(await this.upsertArbeitnowJob(j));
    for (const j of muse) collected.push(await this.upsertMuseJob(j));

    console.log(
      `[searchFreeApis] fetched — linkedin:${linkedin.length} remotive:${remotive.length} ` +
        `remoteok:${remoteOk.length} arbeitnow:${arbeitnow.length} themuse:${muse.length}`,
    );

    // Dedupe by the shared job-identity key (lowercased company|title).
    const seen = new Set<string>();
    const deduped: Job[] = [];
    for (const job of collected) {
      const key = jobIdentityKey(job);
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(job);
    }

    // Each source either pre-filters (Remotive/RemoteOK/Arbeitnow/Muse) or
    // uses server-side keyword matching (LinkedIn). Skipping a redundant
    // local token filter here avoids dropping semantically-matched jobs
    // whose titles don't literally contain the query string.
    let filtered = deduped;

    // Sources that already accept and apply a location param server-side
    // (LinkedIn, TheMuse — see fetchLinkedIn / fetchMuse) are exempt from
    // the redundant text re-check below; Remotive, RemoteOK, and Arbeitnow
    // have no server-side location filter at all, so that re-check is the
    // ONLY thing keeping their out-of-region postings (e.g. a US-based
    // "Engineer III" listing) out of a Riyadh/Jeddah corpus.
    const SERVER_SIDE_LOCATION_FILTERED = new Set(['linkedin', 'themuse']);

    if (params.location) {
      // A concrete-location pass (Riyadh, Jeddah, ...) — real geographic
      // constraint, applied regardless of remoteOnly.
      const loc = params.location.toLowerCase();
      const beforeCount = filtered.length;
      filtered = filtered.filter(
        (j) => (j.source ? SERVER_SIDE_LOCATION_FILTERED.has(j.source) : false) || (j.location?.toLowerCase().includes(loc) ?? false),
      );
      console.log(
        `[searchFreeApis] location filter "${params.location}": ${beforeCount} -> ${filtered.length} survived`,
      );
    } else if (params.remoteOnly) {
      // The worldwide-remote pass: no location given, by design (see
      // runSearchAgentInner) — a genuinely remote-anywhere posting can be
      // based out of any city. But "no location filter" must not mean "any
      // job a remote-leaning board returns", because remote job boards
      // also list region-restricted or fully onsite roles that merely
      // happen to carry a "remote" tag elsewhere on the listing (e.g. a
      // Seattle-based or New York-based posting). Only jobs whose OWN
      // location text reads as a generic remote-anywhere marker (or is
      // blank) survive here; a job naming a specific city/state/country
      // is dropped from this pass — it's not a location-agnostic role, and
      // if it's genuinely in one of the agent's preferred_locations it will
      // already have been picked up by that location's own pass.
      const beforeCount = filtered.length;
      filtered = filtered.filter((j) => isGenericRemoteLocation(j.location));
      console.log(
        `[searchFreeApis] worldwide-remote generic-location filter: ${beforeCount} -> ${filtered.length} survived`,
      );
    }

    const page = Math.max(1, params.page ?? 1);
    const perPage = 50;
    const start = (page - 1) * perPage;

    return { jobs: filtered.slice(start, start + perPage), total: filtered.length, sourceStatus };
  }

  private async fetchRemotive(search: string): Promise<RemotiveJob[]> {
    try {
      const { data } = await axios.get<{ jobs: RemotiveJob[] }>(
        'https://remotive.com/api/remote-jobs',
        { params: { search, limit: 50 }, timeout: 10_000 },
      );
      return data?.jobs ?? [];
    } catch (err) {
      console.error('Remotive API error:', (err as Error).message);
      return [];
    }
  }

  private async upsertRemotiveJob(rJob: RemotiveJob): Promise<Job> {
    const externalId = `remotive-${rJob.id}`;
    const source = 'remotive';

    const existing = await query<Job>(
      `SELECT id, source, external_id, title, normalized_title, company, location,
              description, salary_text, employment_type, apply_url, employer_logo, apply_email, posted_at, created_at
       FROM jobs WHERE source = $1 AND external_id = $2`,
      [source, externalId],
    );

    if (existing.length > 0) return existing[0];

    const id = randomUUID();
    const description = stripHtml(rJob.description).slice(0, 5000);
    const applyEmail = extractApplyEmail(rJob.title, description);
    const postedAt = parseJobPostedDate(rJob.publication_date);

    const rows = await query<Job>(
      `INSERT INTO jobs (id, source, external_id, title, normalized_title, company, location,
                         description, salary_text, employment_type, apply_url, employer_logo, apply_email, posted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (source, external_id) DO NOTHING
       RETURNING id, source, external_id, title, normalized_title, company, location,
                 description, salary_text, employment_type, apply_url, employer_logo, apply_email, posted_at, created_at`,
      [
        id, source, externalId,
        rJob.title, rJob.title.toLowerCase(),
        rJob.company_name,
        rJob.candidate_required_location || 'Remote',
        description,
        rJob.salary || null,
        'عن بعد',
        rJob.url,
        rJob.company_logo_url || null,
        applyEmail,
        postedAt,
      ],
    );

    return (
      rows[0] ?? ({
        id, source, external_id: externalId,
        title: rJob.title, company: rJob.company_name,
        location: rJob.candidate_required_location || 'Remote',
        description, salary_text: rJob.salary || null,
        employment_type: 'عن بعد', apply_url: rJob.url,
        employer_logo: rJob.company_logo_url || null,
        apply_email: applyEmail,
        posted_at: postedAt,
        created_at: new Date(),
      } as Job)
    );
  }

  // =========================================================================
  // RemoteOK
  // =========================================================================

  private async fetchRemoteOk(search: string): Promise<RemoteOkJob[]> {
    const { data } = await axios.get<RemoteOkJob[]>('https://remoteok.com/api', {
      timeout: 10_000,
      headers: { 'User-Agent': 'shughaily-jobs/1.0' },
    });
    // First element is a legend object, strip it.
    const rows = Array.isArray(data) ? data.slice(1) : [];
    const tokens = search
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 1);
    if (tokens.length === 0) return rows.slice(0, 40);
    return rows
      .filter((job) => {
        const hay = `${job.position ?? ''} ${(job.tags ?? []).join(' ')} ${job.description ?? ''}`.toLowerCase();
        return tokens.some((t) => hay.includes(t));
      })
      .slice(0, 40);
  }

  private async upsertRemoteOkJob(rJob: RemoteOkJob): Promise<Job | null> {
    if (!rJob.id || !rJob.position) return null;
    const externalId = `remoteok-${rJob.id}`;
    const source = 'remoteok';

    const existing = await query<Job>(
      `SELECT id, source, external_id, title, normalized_title, company, location,
              description, salary_text, employment_type, apply_url, employer_logo, apply_email, posted_at, created_at
       FROM jobs WHERE source = $1 AND external_id = $2`,
      [source, externalId],
    );
    if (existing.length > 0) return existing[0];

    const id = randomUUID();
    const description = stripHtml(rJob.description ?? '').slice(0, 5000);
    const salary =
      rJob.salary_min && rJob.salary_max
        ? `$${rJob.salary_min} - $${rJob.salary_max}`
        : null;
    const applyUrl = rJob.apply_url ?? rJob.url ?? `https://remoteok.com/remote-jobs/${rJob.id}`;
    const applyEmail = extractApplyEmail(rJob.position, description);
    // Prefer epoch (unambiguous Unix seconds) over the date string.
    const postedAt = parseJobPostedDate(rJob.epoch ?? rJob.date);

    const rows = await query<Job>(
      `INSERT INTO jobs (id, source, external_id, title, normalized_title, company, location,
                         description, salary_text, employment_type, apply_url, employer_logo, apply_email, posted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (source, external_id) DO NOTHING
       RETURNING id, source, external_id, title, normalized_title, company, location,
                 description, salary_text, employment_type, apply_url, employer_logo, apply_email, posted_at, created_at`,
      [
        id, source, externalId,
        rJob.position, rJob.position.toLowerCase(),
        rJob.company ?? 'Unknown',
        rJob.location ?? 'Remote',
        description,
        salary,
        'عن بعد',
        applyUrl,
        rJob.company_logo ?? null,
        applyEmail,
        postedAt,
      ],
    );

    return (
      rows[0] ?? ({
        id, source, external_id: externalId,
        title: rJob.position, company: rJob.company ?? 'Unknown',
        location: rJob.location ?? 'Remote',
        description, salary_text: salary,
        employment_type: 'عن بعد', apply_url: applyUrl,
        employer_logo: rJob.company_logo ?? null,
        apply_email: applyEmail,
        posted_at: postedAt,
        created_at: new Date(),
      } as Job)
    );
  }

  // =========================================================================
  // Arbeitnow
  // =========================================================================

  private async fetchArbeitnow(search: string): Promise<ArbeitnowJob[]> {
    const { data } = await axios.get<{ data: ArbeitnowJob[] }>(
      'https://www.arbeitnow.com/api/job-board-api',
      { timeout: 10_000 },
    );
    const rows = data?.data ?? [];
    const tokens = search
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 1);
    if (tokens.length === 0) return rows.slice(0, 40);
    return rows
      .filter((job) => {
        const hay = `${job.title ?? ''} ${(job.tags ?? []).join(' ')} ${job.description ?? ''}`.toLowerCase();
        return tokens.some((t) => hay.includes(t));
      })
      .slice(0, 40);
  }

  private async upsertArbeitnowJob(aJob: ArbeitnowJob): Promise<Job> {
    const externalId = `arbeitnow-${aJob.slug}`;
    const source = 'arbeitnow';

    const existing = await query<Job>(
      `SELECT id, source, external_id, title, normalized_title, company, location,
              description, salary_text, employment_type, apply_url, employer_logo, apply_email, posted_at, created_at
       FROM jobs WHERE source = $1 AND external_id = $2`,
      [source, externalId],
    );
    if (existing.length > 0) return existing[0];

    const id = randomUUID();
    const description = stripHtml(aJob.description ?? '').slice(0, 5000);
    const employmentType = aJob.remote
      ? 'عن بعد'
      : aJob.job_types?.some((t) => t.toLowerCase().includes('part'))
        ? 'دوام جزئي'
        : 'دوام كامل';
    const applyEmail = extractApplyEmail(aJob.title, description);
    const postedAt = parseJobPostedDate(aJob.created_at);

    const rows = await query<Job>(
      `INSERT INTO jobs (id, source, external_id, title, normalized_title, company, location,
                         description, salary_text, employment_type, apply_url, employer_logo, apply_email, posted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (source, external_id) DO NOTHING
       RETURNING id, source, external_id, title, normalized_title, company, location,
                 description, salary_text, employment_type, apply_url, employer_logo, apply_email, posted_at, created_at`,
      [
        id, source, externalId,
        aJob.title, aJob.title.toLowerCase(),
        aJob.company_name,
        aJob.location || (aJob.remote ? 'Remote' : ''),
        description,
        null,
        employmentType,
        aJob.url,
        null,
        applyEmail,
        postedAt,
      ],
    );

    return (
      rows[0] ?? ({
        id, source, external_id: externalId,
        title: aJob.title, company: aJob.company_name,
        location: aJob.location || (aJob.remote ? 'Remote' : ''),
        description, salary_text: null,
        employment_type: employmentType, apply_url: aJob.url,
        employer_logo: null,
        apply_email: applyEmail,
        posted_at: postedAt,
        created_at: new Date(),
      } as Job)
    );
  }

  // =========================================================================
  // TheMuse
  // =========================================================================

  private async fetchMuse(search: string, location?: string): Promise<MuseJob[]> {
    const params: Record<string, string> = {
      category: 'Engineering',
      page: '0',
    };
    if (location && !/remote|عن بعد/i.test(location)) {
      params.location = location;
    }
    const { data } = await axios.get<{ results: MuseJob[] }>(
      'https://www.themuse.com/api/public/jobs',
      { params, timeout: 10_000 },
    );
    const rows = data?.results ?? [];
    const tokens = search
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 1);
    if (tokens.length === 0) return rows.slice(0, 30);
    return rows
      .filter((job) => {
        const hay = `${job.name ?? ''} ${job.contents ?? ''}`.toLowerCase();
        return tokens.some((t) => hay.includes(t));
      })
      .slice(0, 30);
  }

  private async upsertMuseJob(mJob: MuseJob): Promise<Job> {
    const externalId = `muse-${mJob.id}`;
    const source = 'themuse';

    const existing = await query<Job>(
      `SELECT id, source, external_id, title, normalized_title, company, location,
              description, salary_text, employment_type, apply_url, employer_logo, apply_email, posted_at, created_at
       FROM jobs WHERE source = $1 AND external_id = $2`,
      [source, externalId],
    );
    if (existing.length > 0) return existing[0];

    const id = randomUUID();
    const description = stripHtml(mJob.contents ?? '').slice(0, 5000);
    const location = mJob.locations?.[0]?.name ?? '';
    const employmentType =
      mJob.type?.toLowerCase().includes('part')
        ? 'دوام جزئي'
        : mJob.type?.toLowerCase().includes('intern')
          ? 'تدريب'
          : 'دوام كامل';
    const applyEmail = extractApplyEmail(mJob.name, description);
    const postedAt = parseJobPostedDate(mJob.publication_date);

    const rows = await query<Job>(
      `INSERT INTO jobs (id, source, external_id, title, normalized_title, company, location,
                         description, salary_text, employment_type, apply_url, employer_logo, apply_email, posted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (source, external_id) DO NOTHING
       RETURNING id, source, external_id, title, normalized_title, company, location,
                 description, salary_text, employment_type, apply_url, employer_logo, apply_email, posted_at, created_at`,
      [
        id, source, externalId,
        mJob.name, mJob.name.toLowerCase(),
        mJob.company?.name ?? 'Unknown',
        location,
        description,
        null,
        employmentType,
        mJob.refs?.landing_page ?? null,
        null,
        applyEmail,
        postedAt,
      ],
    );

    return (
      rows[0] ?? ({
        id, source, external_id: externalId,
        title: mJob.name, company: mJob.company?.name ?? 'Unknown',
        location, description, salary_text: null,
        employment_type: employmentType,
        apply_url: mJob.refs?.landing_page ?? null,
        employer_logo: null,
        apply_email: applyEmail,
        posted_at: postedAt,
        created_at: new Date(),
      } as Job)
    );
  }

  // =========================================================================
  // LinkedIn guest-jobs (unofficial, best-effort)
  // =========================================================================

  /**
   * Best-effort LinkedIn scrape. Distinguishes three outcomes instead of
   * collapsing everything into an empty array:
   *  - 'error'    — none of the 4 page requests came back at all (network
   *                 failure, timeout, or every response too short to be a
   *                 real results page — likely blocked/rate-limited).
   *  - 'degraded' — got real HTML back (200, substantial body) but the card
   *                 regex found zero cards, or found cards but couldn't
   *                 extract fields from any of them. Both are strong
   *                 signals of markup drift, not "no jobs today".
   *  - 'ok'       — parsed at least one job normally.
   * Callers must treat LinkedIn as best-effort regardless of status: its
   * jobs are merged in alongside every other source, so a LinkedIn failure
   * never blanks a multi-source run on its own.
   */
  private async fetchLinkedIn(
    search: string,
    location?: string,
    remoteOnly?: boolean,
    seniority?: string[],
    maxAgeDays?: number,
  ): Promise<{ jobs: LinkedInJob[]; status: SourceStatus }> {
    const baseParams: Record<string, string> = { keywords: search };
    if (location && !/remote|عن بعد/i.test(location)) {
      baseParams.location = location;
    }
    if (remoteOnly) {
      // f_WT=2 is the LinkedIn filter for remote roles.
      baseParams.f_WT = '2';
    }
    if (seniority && seniority.length > 0) {
      const codes = [...new Set(seniority.map((s) => SENIORITY_TO_LINKEDIN_EXPERIENCE[s]).filter(Boolean))];
      if (codes.length > 0) {
        baseParams.f_E = codes.join(',');
      }
    }
    if (maxAgeDays !== undefined) {
      // f_TPR = "time posted range", as r<seconds-ago>. Exact (unlike
      // SerpAPI's coarse buckets), but still backed up by the post-fetch
      // filter — this is a request-cost optimization, not the source of
      // truth for the cutoff.
      baseParams.f_TPR = `r${Math.round(maxAgeDays * 86_400)}`;
    }

    // LinkedIn's guest endpoint pages by `start` in steps of 25.
    // Fetch the first 4 pages in parallel → up to ~100 cards.
    const pageStarts = ['0', '25', '50', '75'];
    const fetchPage = async (start: string): Promise<string> => {
      try {
        const { data } = await axios.get<string>(
          'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search',
          {
            params: { ...baseParams, start },
            timeout: 12_000,
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml',
              'Accept-Language': 'en-US,en;q=0.9',
            },
            responseType: 'text',
            transformResponse: [(d: unknown) => d],
            validateStatus: (status) => status >= 200 && status < 500,
          },
        );
        return typeof data === 'string' && data.length >= 100 ? data : '';
      } catch (err) {
        console.error('[LinkedIn] page', start, 'request failed:', (err as Error).message);
        return '';
      }
    };

    const pages = await Promise.all(pageStarts.map(fetchPage));
    const html = pages.filter(Boolean).join('\n');
    if (!html) {
      const note = 'No usable response from any of 4 page requests — likely blocked, rate-limited, or unreachable.';
      console.warn(`[LinkedIn] ${note}`);
      return { jobs: [], status: { source: 'linkedin', status: 'error', count: 0, note } };
    }

    // LinkedIn guest endpoint returns a list of <li><div class="base-card"...>
    // Extract each card block, then pull title/company/location/link via regex.
    const jobs: LinkedInJob[] = [];
    const seenIds = new Set<string>();
    const cardRegex = /<li[^>]*>\s*<div\s+class="base-card[\s\S]*?<\/li>/g;
    const cards = html.match(cardRegex) ?? [];

    if (cards.length === 0) {
      const note = `Got ${html.length} chars of HTML back but the card regex matched zero <li> blocks — LinkedIn's markup likely changed, or this was a block/challenge page.`;
      console.warn(`[LinkedIn] ${note}`);
      return { jobs: [], status: { source: 'linkedin', status: 'degraded', count: 0, note } };
    }

    for (const card of cards) {
      const titleMatch =
        card.match(/<h3[^>]*class="[^"]*base-search-card__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/i) ||
        card.match(/<span[^>]*class="[^"]*sr-only[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      const companyMatch = card.match(
        /<h4[^>]*class="[^"]*base-search-card__subtitle[^"]*"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i,
      );
      const locationMatch = card.match(
        /<span[^>]*class="[^"]*job-search-card__location[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
      );
      const linkMatch =
        card.match(/<a[^>]*class="[^"]*base-card__full-link[^"]*"[^>]*href="([^"]+)"/i) ||
        card.match(/<a[^>]*href="(https:\/\/[^"]*linkedin\.com\/jobs\/view[^"]*)"/i);
      const timeMatch = card.match(
        /<time[^>]*datetime="([^"]+)"/i,
      );
      const urnMatch =
        card.match(/data-entity-urn="urn:li:jobPosting:(\d+)"/i) ||
        card.match(/currentJobId=(\d+)/i);

      const title = titleMatch?.[1]?.replace(/<[^>]+>/g, '').trim();
      const company = companyMatch?.[1]?.replace(/<[^>]+>/g, '').trim();
      const loc = locationMatch?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';
      const applyUrl = linkMatch?.[1]?.split('?')[0]?.trim();
      const jobId = urnMatch?.[1] ?? linkMatch?.[1]?.match(/jobs\/view\/[^/]*-(\d+)/i)?.[1];

      if (!title || !company || !applyUrl || !jobId) continue;
      if (seenIds.has(jobId)) continue;
      seenIds.add(jobId);

      jobs.push({
        jobId,
        title: stripHtml(title),
        company: stripHtml(company),
        location: stripHtml(loc),
        applyUrl,
        description: '',
        postedAt: timeMatch?.[1],
      });
    }

    if (jobs.length === 0) {
      const note = `Found ${cards.length} card block(s) but couldn't extract required fields from any of them — LinkedIn's inner card markup likely changed.`;
      console.warn(`[LinkedIn] ${note}`);
      return { jobs: [], status: { source: 'linkedin', status: 'degraded', count: 0, note } };
    }

    return { jobs, status: { source: 'linkedin', status: 'ok', count: jobs.length } };
  }

  private async upsertLinkedInJob(lJob: LinkedInJob): Promise<Job> {
    const externalId = `linkedin-${lJob.jobId}`;
    const source = 'linkedin';

    const existing = await query<Job>(
      `SELECT id, source, external_id, title, normalized_title, company, location,
              description, salary_text, employment_type, apply_url, employer_logo, apply_email, posted_at, created_at
       FROM jobs WHERE source = $1 AND external_id = $2`,
      [source, externalId],
    );
    if (existing.length > 0) return existing[0];

    const id = randomUUID();
    const loc = lJob.location || '';
    const employmentType = /remote/i.test(loc) ? 'عن بعد' : 'دوام كامل';
    // LinkedIn card scraping never captures a description (see fetchLinkedIn),
    // so this will realistically always resolve to null — which is the
    // correct outcome anyway: LinkedIn postings go through LinkedIn's own
    // apply flow, not email, and are out of scope for auto-apply regardless.
    const applyEmail = extractApplyEmail(lJob.title, lJob.description);
    const postedAt = parseJobPostedDate(lJob.postedAt);

    const rows = await query<Job>(
      `INSERT INTO jobs (id, source, external_id, title, normalized_title, company, location,
                         description, salary_text, employment_type, apply_url, employer_logo, apply_email, posted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (source, external_id) DO NOTHING
       RETURNING id, source, external_id, title, normalized_title, company, location,
                 description, salary_text, employment_type, apply_url, employer_logo, apply_email, posted_at, created_at`,
      [
        id, source, externalId,
        lJob.title, lJob.title.toLowerCase(),
        lJob.company,
        loc,
        lJob.description ?? '',
        null,
        employmentType,
        lJob.applyUrl,
        null,
        applyEmail,
        postedAt,
      ],
    );

    return (
      rows[0] ?? ({
        id, source, external_id: externalId,
        title: lJob.title, company: lJob.company,
        location: loc, description: lJob.description ?? '',
        salary_text: null, employment_type: employmentType,
        apply_url: lJob.applyUrl, employer_logo: null,
        apply_email: applyEmail,
        posted_at: postedAt,
        created_at: new Date(),
      } as Job)
    );
  }
}

export const jobSearchService = new JobSearchService();
