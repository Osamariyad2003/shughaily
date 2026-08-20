/**
 * Best-effort extraction of an application/contact email from a job
 * posting's title + description text, for the email-based auto-apply path.
 *
 * Job descriptions often contain unrelated emails (support@, a recruiter's
 * signature, a company's generic info@ line copy-pasted from elsewhere), so
 * this doesn't just grab the first email in the text — it scores every email
 * found by how close it sits to an "apply/send your CV" style cue (in either
 * Arabic or English) and picks the best-scoring one. Returns null when no
 * email is found at all, which is the "not eligible for auto-apply" signal
 * the rest of the pipeline relies on.
 */

const EMAIL_RE = /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/g;

// Domains that show up constantly as tracking/no-reply/platform noise rather
// than a real "send your application here" address.
const IGNORED_DOMAIN_PATTERNS = [
  /noreply/i,
  /no-reply/i,
  /notifications?@/i,
  /@sentry\./i,
  /@example\.com$/i,
  /\.(png|jpg|jpeg|gif|svg|webp)$/i, // occasionally matches inline asset filenames mistaken for emails
];

// Cue phrases (Arabic + English) that indicate a nearby email is genuinely
// an application contact, not incidental text.
const APPLY_CUES = [
  // English
  /send\s+(your\s+)?(cv|resume|application)/i,
  /apply\s+(by|via|through)?\s*email/i,
  /email\s+(your\s+)?(cv|resume)/i,
  /forward\s+(your\s+)?(cv|resume)/i,
  /contact\s+us\s+at/i,
  /reach\s+out\s+to/i,
  // Arabic
  /أرسل(ي)?\s*(سيرتك|السيرة|سيرتكم)/,
  /إرسال\s*(السيرة|سيرة)/,
  /التقديم\s*(عبر|على|من خلال)?\s*(البريد|الايميل|الإيميل)/,
  /(البريد|الايميل|الإيميل)\s*(الالكتروني|الإلكتروني)?\s*:/,
];

const CUE_WINDOW = 120; // characters of context scanned on each side of a match

function isIgnoredEmail(email: string): boolean {
  return IGNORED_DOMAIN_PATTERNS.some((re) => re.test(email));
}

/**
 * Extracts the best-guess application email from a job's title +
 * description, or null if none was found. Safe on empty/undefined input.
 */
export function extractApplyEmail(title?: string | null, description?: string | null): string | null {
  const text = `${title ?? ''}\n${description ?? ''}`;
  if (!text.trim()) return null;

  const matches = Array.from(text.matchAll(EMAIL_RE))
    .map((m) => ({ email: m[0], index: m.index ?? 0 }))
    .filter((m) => !isIgnoredEmail(m.email));

  if (matches.length === 0) return null;

  let best: { email: string; score: number } | null = null;
  const seen = new Set<string>();

  for (const { email, index } of matches) {
    const normalized = email.trim().replace(/[.,;:)]+$/, '').toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const windowStart = Math.max(0, index - CUE_WINDOW);
    const windowEnd = Math.min(text.length, index + email.length + CUE_WINDOW);
    const context = text.slice(windowStart, windowEnd);

    const cueHit = APPLY_CUES.some((re) => re.test(context));
    // Local part hints (careers@, jobs@, hr@, recruit*@) are a weaker but
    // still useful positive signal even without a cue phrase nearby.
    const localPart = normalized.split('@')[0];
    const roleHint = /^(careers?|jobs?|hr|recruit(ment|ing)?|talent|hiring|apply)/i.test(localPart);

    const score = (cueHit ? 2 : 0) + (roleHint ? 1 : 0);

    if (!best || score > best.score) {
      best = { email: normalized, score };
    }
  }

  if (!best) return null;
  // Require at least a cue-phrase or role-hint match — otherwise the text
  // just happens to contain an email (e.g. a company's generic contact
  // page footer) and we'd rather stay eligible=false than mis-parse.
  return best.score > 0 ? best.email : null;
}
