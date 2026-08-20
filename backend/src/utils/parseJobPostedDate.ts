/**
 * Normalizes a job posting's reported date — which every source formats
 * differently — into an absolute Date. Used both to populate jobs.posted_at
 * at ingestion time (see the upsert* functions in jobSearch.service.ts) and
 * to drive the search-agent recency filter (agent.max_age_days), so this is
 * the single source of truth for "how old is this posting" everywhere in
 * the app — including the "posted" label already shown on job cards
 * (formatRelativeDate(job.posted_at || job.created_at) on the frontend).
 *
 * Handles:
 *  - A Unix timestamp, as seconds (Arbeitnow's created_at, RemoteOK's
 *    epoch) or milliseconds (accepted defensively — not currently produced
 *    by any source here, but a cheap safety net).
 *  - An absolute ISO/RFC date string (Remotive's publication_date,
 *    RemoteOK's date, TheMuse's publication_date, LinkedIn's <time
 *    datetime> attribute).
 *  - A relative English string, as SerpAPI/Google Jobs reports it
 *    (detected_extensions.posted_at): "13 hours ago", "26 days ago",
 *    "30+ days ago", "just posted", "today", "yesterday", "50m ago".
 *  - A relative Arabic string ("قبل 5 أيام", "منذ يومين", "أمس", "اليوم"),
 *    including Arabic-Indic digits (٠-٩) and the Arabic dual form ("يومين"
 *    = "two days", not "2 يوم").
 *
 * Returns null if nothing above could make sense of the input. Callers
 * MUST treat null as "date unknown", never as "very old" — see the
 * search-agent recency filter's missing-date policy: undated jobs are
 * kept, never dropped, and tagged date_confidence: 'unknown'.
 */
export function parseJobPostedDate(
  raw: string | number | null | undefined,
  referenceNow: Date = new Date(),
): Date | null {
  if (raw === null || raw === undefined) return null;

  if (typeof raw === 'number') {
    return fromEpoch(raw);
  }

  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Arabic-Indic digits (٠-٩) -> ASCII so both the relative-string parsing
  // below and the Date.parse fallback can read the number either way.
  const normalized = trimmed.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

  const relative = parseRelative(normalized, referenceNow);
  if (relative) return relative;

  // A numeric string is more likely a Unix timestamp that arrived
  // JSON-stringified than a year like "1700000000" — route it through the
  // same epoch heuristic rather than letting Date.parse misread it.
  if (/^\d+$/.test(normalized)) {
    return fromEpoch(Number(normalized));
  }

  // Absolute date/ISO/RFC string. An ISO-shaped "date + time" string with
  // no trailing 'Z'/offset (e.g. Remotive's publication_date,
  // "2026-08-14T20:33:39") is NOT local time — every source here reports
  // UTC without saying so — but per the ES2015 spec, `new Date()` parses a
  // timezone-less date-time string as LOCAL time, not UTC. Left alone,
  // that silently shifts every such timestamp by the server's UTC offset.
  // Treat it as UTC explicitly by appending 'Z' before parsing. A bare
  // date-only string ("2026-07-15", no time component) is unaffected —
  // that form IS specified to parse as UTC already.
  const isoNoZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
  const forParsing = isoNoZone.test(normalized) ? `${normalized}Z` : normalized;

  const parsed = new Date(forParsing);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function fromEpoch(value: number): Date | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  // Heuristic: a seconds epoch for "now" is ~10 digits, a milliseconds
  // epoch for "now" is ~13 — 1e12 sits cleanly between the two.
  const ms = value < 1e12 ? value * 1000 : value;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS; // approximate — good enough for a recency filter
const YEAR_MS = 365 * DAY_MS;

type UnitCode = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

const UNIT_MS: Record<UnitCode, number> = {
  minute: MINUTE_MS,
  hour: HOUR_MS,
  day: DAY_MS,
  week: WEEK_MS,
  month: MONTH_MS,
  year: YEAR_MS,
};

// English relative-time unit spellings/abbreviations seen across sources
// (SerpAPI writes them out fully; other feeds sometimes abbreviate, e.g.
// "50m ago", "3mo ago").
const EN_UNIT: Record<string, UnitCode> = {
  minute: 'minute', minutes: 'minute', min: 'minute', mins: 'minute', m: 'minute',
  hour: 'hour', hours: 'hour', hr: 'hour', hrs: 'hour', h: 'hour',
  day: 'day', days: 'day', d: 'day',
  week: 'week', weeks: 'week', w: 'week',
  month: 'month', months: 'month', mo: 'month', mos: 'month',
  year: 'year', years: 'year', y: 'year',
};

// Arabic singular/plural unit words -> unit code.
const AR_UNIT: Record<string, UnitCode> = {
  'دقيقة': 'minute', 'دقائق': 'minute',
  'ساعة': 'hour', 'ساعات': 'hour',
  'يوم': 'day', 'أيام': 'day',
  'أسبوع': 'week', 'أسابيع': 'week',
  'شهر': 'month', 'أشهر': 'month',
  'سنة': 'year', 'سنوات': 'year', 'عام': 'year',
};

// Arabic dual form ("two X") is a distinct word, not "2 X" — e.g. "يومين"
// means "two days", not "يوم" repeated with a "2" prefix.
const AR_DUAL_UNIT: Record<string, UnitCode> = {
  'يومين': 'day',
  'ساعتين': 'hour',
  'أسبوعين': 'week',
  'شهرين': 'month',
  'سنتين': 'year',
};

function parseRelative(text: string, now: Date): Date | null {
  const lower = text.toLowerCase();

  if (/^(just posted|just now|today|new)$/.test(lower) || text === 'اليوم') {
    return new Date(now.getTime());
  }
  if (lower === 'yesterday' || text === 'أمس') {
    return new Date(now.getTime() - DAY_MS);
  }

  // English: "5 days ago", "13 hours ago", "2 weeks ago", "30+ days ago",
  // "50m ago", "3mo ago" — the trailing "+" (as in SerpAPI's "30+ days
  // ago") is accepted but ignored; treating it as exactly N is close
  // enough for a recency filter and errs toward NOT silently including a
  // job that's actually well past the cutoff.
  const enMatch = lower.match(/^(\d+)\+?\s*([a-z]+)\s*ago$/);
  if (enMatch) {
    const unit = EN_UNIT[enMatch[2]];
    if (unit) return new Date(now.getTime() - Number(enMatch[1]) * UNIT_MS[unit]);
  }

  // Arabic dual form: "قبل يومين" / "منذ يومين" (also bare "يومين").
  const arDualWord = text.match(/^(?:قبل|منذ)?\s*(يومين|ساعتين|أسبوعين|شهرين|سنتين)$/);
  if (arDualWord) {
    const unit = AR_DUAL_UNIT[arDualWord[1]];
    if (unit) return new Date(now.getTime() - 2 * UNIT_MS[unit]);
  }

  // Arabic: "قبل 5 أيام", "منذ 3 أسابيع", "قبل ساعة" (bare unit = 1).
  const arMatch = text.match(
    /^(?:قبل|منذ)\s*(\d+)?\s*(دقيقة|دقائق|ساعة|ساعات|يوم|أيام|أسبوع|أسابيع|شهر|أشهر|سنة|سنوات|عام)$/,
  );
  if (arMatch) {
    const unit = AR_UNIT[arMatch[2]];
    const count = arMatch[1] ? Number(arMatch[1]) : 1;
    if (unit) return new Date(now.getTime() - count * UNIT_MS[unit]);
  }

  return null;
}
