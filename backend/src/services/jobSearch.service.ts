import axios from 'axios';
import { randomUUID } from 'crypto';
import { config } from '../config';
import { query } from '../config/database';
import { Job } from '../types';

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
  date?: string;
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

class JobSearchService {
  /**
   * Search for jobs. Uses SerpAPI (Google Jobs) as primary source,
   * falls back to free APIs (Remotive) if SerpAPI is not configured.
   */
  async search(params: {
    query: string;
    location?: string;
    page?: number;
    remoteOnly?: boolean;
    employmentType?: string;
    apiKey?: string;
  }): Promise<{ jobs: Job[]; total: number }> {
    // Run Google Jobs (if configured) and the free aggregator in parallel,
    // then merge + dedupe so results come from as many sources as possible.
    const tasks: Promise<{ jobs: Job[]; total: number }>[] = [this.searchFreeApis(params)];
    if (params.apiKey || config.serpApiKey) {
      tasks.unshift(
        this.searchSerpApi(params).catch((err) => {
          console.error('[SerpApi] failed, continuing with free sources:', (err as Error).message);
          return { jobs: [] as Job[], total: 0 };
        }),
      );
    }

    const results = await Promise.all(tasks);

    const seen = new Set<string>();
    const merged: Job[] = [];
    for (const r of results) {
      for (const job of r.jobs) {
        const key = `${(job.company ?? '').toLowerCase().trim()}|${(job.title ?? '').toLowerCase().trim()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(job);
      }
    }

    return { jobs: merged, total: merged.length };
  }

  // =========================================================================
  // SerpAPI — Google Jobs (primary)
  // =========================================================================

  private async searchSerpApi(params: {
    query: string;
    location?: string;
    page?: number;
    remoteOnly?: boolean;
    employmentType?: string;
    apiKey?: string;
  }): Promise<{ jobs: Job[]; total: number }> {
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

    // chips for employment type
    if (params.employmentType) {
      const chipMap: Record<string, string> = {
        'دوام كامل': 'employment_type:FULLTIME',
        'دوام جزئي': 'employment_type:PARTTIME',
        'عقد': 'employment_type:CONTRACTOR',
        'تدريب': 'employment_type:INTERN',
      };
      if (chipMap[params.employmentType]) {
        serpParams.chips = chipMap[params.employmentType];
      }
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
        return this.searchFreeApis(params);
      }

      serpJobs = data.jobs_results ?? [];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('SerpAPI request failed:', msg);
      return this.searchFreeApis(params);
    }
    const jobs: Job[] = [];

    for (const sJob of serpJobs) {
      jobs.push(await this.upsertSerpJob(sJob));
    }

    return { jobs, total: jobs.length };
  }

  private async upsertSerpJob(sJob: SerpJob): Promise<Job> {
    const externalId = sJob.job_id;
    const source = 'google_jobs';

    const existing = await query<Job>(
      `SELECT id, source, external_id, title, normalized_title, company, location,
              description, salary_text, employment_type, apply_url, employer_logo, created_at
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

    const rows = await query<Job>(
      `INSERT INTO jobs (id, source, external_id, title, normalized_title, company, location,
                         description, salary_text, employment_type, apply_url, employer_logo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (source, external_id) DO NOTHING
       RETURNING id, source, external_id, title, normalized_title, company, location,
                 description, salary_text, employment_type, apply_url, employer_logo, created_at`,
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
      ],
    );

    return (
      rows[0] ?? ({
        id, source, external_id: externalId,
        title: sJob.title, company: sJob.company_name,
        location: sJob.location, description: sJob.description?.slice(0, 5000),
        salary_text: salary, employment_type: empType,
        apply_url: applyUrl, employer_logo: sJob.thumbnail ?? null,
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
  private async searchFreeApis(params: {
    query: string;
    location?: string;
    page?: number;
    remoteOnly?: boolean;
  }): Promise<{ jobs: Job[]; total: number }> {
    const q = params.query.trim();

    const [remotive, remoteOk, arbeitnow, muse, linkedin] = await Promise.all([
      this.fetchRemotive(q).catch((err) => {
        console.error('[Remotive] fetch failed:', (err as Error).message);
        return [] as RemotiveJob[];
      }),
      this.fetchRemoteOk(q).catch((err) => {
        console.error('[RemoteOK] fetch failed:', (err as Error).message);
        return [] as RemoteOkJob[];
      }),
      this.fetchArbeitnow(q).catch((err) => {
        console.error('[Arbeitnow] fetch failed:', (err as Error).message);
        return [] as ArbeitnowJob[];
      }),
      this.fetchMuse(q, params.location).catch((err) => {
        console.error('[TheMuse] fetch failed:', (err as Error).message);
        return [] as MuseJob[];
      }),
      this.fetchLinkedIn(q, params.location, params.remoteOnly).catch((err) => {
        console.error('[LinkedIn] fetch failed:', (err as Error).message);
        return [] as LinkedInJob[];
      }),
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

    // Dedupe by (company|title) lowercased
    const seen = new Set<string>();
    const deduped: Job[] = [];
    for (const job of collected) {
      const key = `${(job.company ?? '').toLowerCase().trim()}|${(job.title ?? '').toLowerCase().trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(job);
    }

    // Each source either pre-filters (Remotive/RemoteOK/Arbeitnow/Muse) or
    // uses server-side keyword matching (LinkedIn). Skipping a redundant
    // local token filter here avoids dropping semantically-matched jobs
    // whose titles don't literally contain the query string.
    let filtered = deduped;

    // Location filter (skip if remote-only was requested, since remote jobs
    // report varying location strings like "worldwide" or "anywhere").
    // LinkedIn jobs are also exempt because its guest endpoint already
    // honors the location param server-side.
    if (params.location && !params.remoteOnly) {
      const loc = params.location.toLowerCase();
      filtered = filtered.filter(
        (j) => j.source === 'linkedin' || (j.location?.toLowerCase().includes(loc) ?? false),
      );
    }

    const page = Math.max(1, params.page ?? 1);
    const perPage = 50;
    const start = (page - 1) * perPage;

    return { jobs: filtered.slice(start, start + perPage), total: filtered.length };
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
              description, salary_text, employment_type, apply_url, employer_logo, created_at
       FROM jobs WHERE source = $1 AND external_id = $2`,
      [source, externalId],
    );

    if (existing.length > 0) return existing[0];

    const id = randomUUID();
    const description = stripHtml(rJob.description).slice(0, 5000);

    const rows = await query<Job>(
      `INSERT INTO jobs (id, source, external_id, title, normalized_title, company, location,
                         description, salary_text, employment_type, apply_url, employer_logo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (source, external_id) DO NOTHING
       RETURNING id, source, external_id, title, normalized_title, company, location,
                 description, salary_text, employment_type, apply_url, employer_logo, created_at`,
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
              description, salary_text, employment_type, apply_url, employer_logo, created_at
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

    const rows = await query<Job>(
      `INSERT INTO jobs (id, source, external_id, title, normalized_title, company, location,
                         description, salary_text, employment_type, apply_url, employer_logo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (source, external_id) DO NOTHING
       RETURNING id, source, external_id, title, normalized_title, company, location,
                 description, salary_text, employment_type, apply_url, employer_logo, created_at`,
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
              description, salary_text, employment_type, apply_url, employer_logo, created_at
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

    const rows = await query<Job>(
      `INSERT INTO jobs (id, source, external_id, title, normalized_title, company, location,
                         description, salary_text, employment_type, apply_url, employer_logo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (source, external_id) DO NOTHING
       RETURNING id, source, external_id, title, normalized_title, company, location,
                 description, salary_text, employment_type, apply_url, employer_logo, created_at`,
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
              description, salary_text, employment_type, apply_url, employer_logo, created_at
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

    const rows = await query<Job>(
      `INSERT INTO jobs (id, source, external_id, title, normalized_title, company, location,
                         description, salary_text, employment_type, apply_url, employer_logo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (source, external_id) DO NOTHING
       RETURNING id, source, external_id, title, normalized_title, company, location,
                 description, salary_text, employment_type, apply_url, employer_logo, created_at`,
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
        created_at: new Date(),
      } as Job)
    );
  }

  // =========================================================================
  // LinkedIn guest-jobs (unofficial, best-effort)
  // =========================================================================

  private async fetchLinkedIn(
    search: string,
    location?: string,
    remoteOnly?: boolean,
  ): Promise<LinkedInJob[]> {
    const baseParams: Record<string, string> = { keywords: search };
    if (location && !/remote|عن بعد/i.test(location)) {
      baseParams.location = location;
    }
    if (remoteOnly) {
      // f_WT=2 is the LinkedIn filter for remote roles.
      baseParams.f_WT = '2';
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
    if (!html) return [];

    // LinkedIn guest endpoint returns a list of <li><div class="base-card"...>
    // Extract each card block, then pull title/company/location/link via regex.
    const jobs: LinkedInJob[] = [];
    const seenIds = new Set<string>();
    const cardRegex = /<li[^>]*>\s*<div\s+class="base-card[\s\S]*?<\/li>/g;
    const cards = html.match(cardRegex) ?? [];

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

    return jobs;
  }

  private async upsertLinkedInJob(lJob: LinkedInJob): Promise<Job> {
    const externalId = `linkedin-${lJob.jobId}`;
    const source = 'linkedin';

    const existing = await query<Job>(
      `SELECT id, source, external_id, title, normalized_title, company, location,
              description, salary_text, employment_type, apply_url, employer_logo, created_at
       FROM jobs WHERE source = $1 AND external_id = $2`,
      [source, externalId],
    );
    if (existing.length > 0) return existing[0];

    const id = randomUUID();
    const loc = lJob.location || '';
    const employmentType = /remote/i.test(loc) ? 'عن بعد' : 'دوام كامل';

    const rows = await query<Job>(
      `INSERT INTO jobs (id, source, external_id, title, normalized_title, company, location,
                         description, salary_text, employment_type, apply_url, employer_logo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (source, external_id) DO NOTHING
       RETURNING id, source, external_id, title, normalized_title, company, location,
                 description, salary_text, employment_type, apply_url, employer_logo, created_at`,
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
      ],
    );

    return (
      rows[0] ?? ({
        id, source, external_id: externalId,
        title: lJob.title, company: lJob.company,
        location: loc, description: lJob.description ?? '',
        salary_text: null, employment_type: employmentType,
        apply_url: lJob.applyUrl, employer_logo: null,
        created_at: new Date(),
      } as Job)
    );
  }
}

export const jobSearchService = new JobSearchService();
