import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Status } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Maps the backend's six-stage application pipeline onto the Rushd
 * <StatusBadge /> five-value Status type. */
export function mapApplicationStatus(status: string): Status {
  const map: Record<string, Status> = {
    saved: 'new',
    applied: 'applied',
    interviewing: 'interview',
    offered: 'offer',
    rejected: 'rejected',
    withdrawn: 'rejected',
  }
  return map[status] ?? 'new'
}

/**
 * Data from the API isn't always as fully-typed as it claims to be — e.g. a
 * recommendation whose match never got its job embedded server-side ends up
 * with neither `posted_at` nor `created_at` despite the TS type saying
 * `created_at` is required. `new Date(undefined)` / `new Date(garbage)`
 * silently produces an Invalid Date, and formatting an Invalid Date throws
 * a RangeError — which, with nothing catching it, blanks the whole page.
 * Both formatters degrade to a safe placeholder instead.
 */
function toValidDate(date?: string | Date | null): Date | null {
  if (!date) return null
  const d = new Date(date)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatDate(date?: string | Date | null): string {
  const d = toValidDate(date)
  if (!d) return '—'
  return new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d)
}

// A plain function (not a component/hook) can't call useTranslation()
// itself, so the caller passes the current locale — default 'ar' keeps
// every pre-existing call site working unchanged, but any caller that
// cares about matching the active UI language should pass it explicitly
// (see JobCard/ApplicationsPage/DashboardPage for the pattern).
export function formatRelativeDate(date?: string | Date | null, locale: 'ar' | 'en' = 'ar'): string {
  const d = toValidDate(date)
  if (!d) return '—'

  const diffMs = Date.now() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (locale === 'en') {
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    return formatDate(d)
  }

  if (diffDays === 0) return 'اليوم'
  if (diffDays === 1) return 'أمس'
  if (diffDays < 7) return `منذ ${diffDays} أيام`
  if (diffDays < 30) return `منذ ${Math.floor(diffDays / 7)} أسابيع`
  return formatDate(d)
}

export function getMatchScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-[#0EA5A4]'
  if (score >= 40) return 'text-amber-500'
  return 'text-red-500'
}

export function getMatchScoreBg(score: number): string {
  if (score >= 80) return 'bg-green-500'
  if (score >= 60) return 'bg-[#0EA5A4]'
  if (score >= 40) return 'bg-amber-500'
  return 'bg-red-500'
}

export function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    saved: 'تم الحفظ',
    applied: 'تم التقديم',
    interviewing: 'مقابلة',
    offered: 'عرض',
    rejected: 'مرفوض',
    withdrawn: 'منسحب',
  }
  return map[status] || status
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    saved: 'bg-slate-100 text-slate-600',
    applied: 'bg-blue-100 text-blue-700',
    interviewing: 'bg-amber-100 text-amber-700',
    offered: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    withdrawn: 'bg-slate-200 text-slate-700',
  }
  return map[status] || 'bg-slate-100 text-slate-600'
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}...`
}
