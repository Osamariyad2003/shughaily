import { type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { Bookmark, Building2, MapPin, Briefcase, Wallet, Globe } from 'lucide-react'
import { cn, formatRelativeDate } from '@/lib/utils'
import { useTranslation } from '@/store/i18nStore'
import type { Job } from '@/lib/types'

export interface JobCardProps {
  job: Job
  onSave?: (jobId: string) => void
  onUnsave?: (jobId: string) => void
  className?: string
}

function scoreBand(score: number): 'high' | 'mid' | 'low' {
  if (score >= 80) return 'high'
  if (score >= 55) return 'mid'
  return 'low'
}

function MatchScoreRing({ score }: { score: number }) {
  const { t } = useTranslation()
  const band = scoreBand(score)
  const radius = 20
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, score))
  const offset = circumference * (1 - clamped / 100)

  return (
    <div
      className={cn('rushd-match-ring', `rushd-match-ring--${band}`)}
      role="img"
      aria-label={t('jobCard.matchPercent', { percent: Math.round(clamped) })}
    >
      <svg viewBox="0 0 48 48" width="48" height="48">
        <circle className="rushd-match-ring__track" cx="24" cy="24" r={radius} fill="none" strokeWidth="4" />
        <circle
          className="rushd-match-ring__value"
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 24 24)"
        />
      </svg>
      <span className="rushd-match-ring__value-label" aria-hidden="true">
        {Math.round(clamped)}%
      </span>
    </div>
  )
}

/**
 * Rushd JobCard — the design system's signature detail: a circular SVG
 * match-score ring (green ≥80, saffron ≥55, grey below) paired with a
 * right-anchored accent rule drawn with logical properties.
 */
export default function JobCard({ job, onSave, onUnsave, className }: JobCardProps) {
  const { t, language } = useTranslation()
  const isSaved = job.is_saved ?? false
  const matchScore = job.match_score
  const canToggleSave = Boolean(onSave || onUnsave)

  const handleSaveClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (isSaved) onUnsave?.(job.id)
    else onSave?.(job.id)
  }

  return (
    <Link to={`/jobs/${job.id}`} className={cn('rushd-jobcard', className)}>
      <span className="rushd-jobcard__accent-rule" aria-hidden="true" />
      <div className="rushd-jobcard__body">
        <div className="rushd-jobcard__main">
          <div className="rushd-jobcard__title-row">
            <h3 className="rushd-jobcard__title">{job.title}</h3>
            {job.is_remote && (
              <span className="rushd-jobcard__remote-badge">
                <Globe size={12} aria-hidden="true" />
                {t('jobCard.remote')}
              </span>
            )}
          </div>

          <div className="rushd-jobcard__meta">
            {job.company && (
              <span className="rushd-jobcard__meta-item">
                <Building2 size={14} aria-hidden="true" />
                {job.company}
              </span>
            )}
            {job.location && (
              <span className="rushd-jobcard__meta-item">
                <MapPin size={14} aria-hidden="true" />
                {job.location}
              </span>
            )}
            {job.employment_type && (
              <span className="rushd-jobcard__meta-item">
                <Briefcase size={14} aria-hidden="true" />
                {job.employment_type}
              </span>
            )}
            {job.salary_text && (
              <span className="rushd-jobcard__meta-item">
                <Wallet size={14} aria-hidden="true" />
                {job.salary_text}
              </span>
            )}
          </div>

          {job.description && <p className="rushd-jobcard__description">{job.description}</p>}

          <div className="rushd-jobcard__footer">
            <span className="rushd-jobcard__date">{formatRelativeDate(job.posted_at || job.created_at, language)}</span>
            {canToggleSave && (
              <button
                type="button"
                className={cn('rushd-jobcard__save', isSaved && 'rushd-jobcard__save--active')}
                onClick={handleSaveClick}
                aria-label={isSaved ? t('jobCard.unsave') : t('jobCard.save')}
                aria-pressed={isSaved}
              >
                <Bookmark size={16} className={isSaved ? 'fill-current' : undefined} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {typeof matchScore === 'number' && <MatchScoreRing score={matchScore} />}
      </div>
    </Link>
  )
}
