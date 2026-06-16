import { Bookmark, MapPin, Building2, Briefcase, Wallet, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { formatRelativeDate } from '@/lib/utils'
import type { Job } from '@/lib/types'

const SOURCE_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  google_jobs: 'Google Jobs',
  remotive: 'Remotive',
  remoteok: 'RemoteOK',
  arbeitnow: 'Arbeitnow',
  themuse: 'The Muse',
}

interface JobCardProps {
  job: Job & {
    match_score?: number
    source?: string
    is_saved?: boolean
    posted_at?: string
  }
  onSave?: (jobId: string) => void
  onUnsave?: (jobId: string) => void
}

export default function JobCard({ job, onSave, onUnsave }: JobCardProps) {
  const isSaved = job.is_saved ?? false
  const matchScore = job.match_score

  const handleSaveClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (isSaved) onUnsave?.(job.id)
    else onSave?.(job.id)
  }

  const freshnessLabel = (() => {
    if (!job.posted_at && !job.created_at) return null
    const date = new Date(job.posted_at || job.created_at)
    const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
    if (days < 1) return { label: 'جديد', variant: 'success' as const }
    if (days < 7) return { label: 'هذا الأسبوع', variant: 'default' as const }
    if (days > 30) return { label: 'قديم', variant: 'neutral' as const }
    return null
  })()

  return (
    <Link to={`/jobs/${job.id}`} className="block">
      <Card hoverable className="transition-all duration-200">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <h3 className="text-lg font-bold text-[#0F172A] line-clamp-1">{job.title}</h3>
              {freshnessLabel && (
                <Badge variant={freshnessLabel.variant}>{freshnessLabel.label}</Badge>
              )}
              {job.source && (
                <span className="inline-flex items-center gap-1 text-xs text-[#64748B]">
                  <ExternalLink className="w-3 h-3" />
                  {SOURCE_LABELS[job.source] ?? job.source}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm text-[#64748B] mb-3">
              {job.company && (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="w-4 h-4" />
                  {job.company}
                </span>
              )}
              {job.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" />
                  {job.location}
                </span>
              )}
              {job.employment_type && (
                <span className="inline-flex items-center gap-1.5">
                  <Briefcase className="w-4 h-4" />
                  {job.employment_type}
                </span>
              )}
              {job.salary_text && (
                <span className="inline-flex items-center gap-1.5">
                  <Wallet className="w-4 h-4" />
                  {job.salary_text}
                </span>
              )}
            </div>

            {job.description && (
              <p className="text-sm text-[#64748B] line-clamp-2">{job.description}</p>
            )}

            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-[#64748B]">
                {formatRelativeDate(job.posted_at || job.created_at)}
              </span>
              {matchScore !== undefined && (
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#0EA5A4] rounded-full"
                      style={{ width: `${matchScore}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-[#0EA5A4]">{Math.round(matchScore)}%</span>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleSaveClick}
            className={`p-2 rounded-lg transition-colors ${
              isSaved
                ? 'bg-[#CCFBF1] text-[#0EA5A4]'
                : 'text-[#64748B] hover:bg-[#F8FAFC]'
            }`}
            aria-label={isSaved ? 'إلغاء الحفظ' : 'حفظ'}
          >
            <Bookmark className={`w-5 h-5 ${isSaved ? 'fill-current' : ''}`} />
          </button>
        </div>
      </Card>
    </Link>
  )
}
