import { Link } from 'react-router-dom'
import { Bookmark, Briefcase, FileText, Star } from 'lucide-react'
import Card from '@/components/ui/Card'
import Spinner from '@/components/ui/Spinner'
import { JobCard } from '@/components/rushd'
import { useDashboardStats, useRecentActivity } from '@/hooks/useDashboard'
import { useRecommendedJobs, useSaveJob } from '@/hooks/useJobs'
import { cn, formatRelativeDate } from '@/lib/utils'
import { useTranslation } from '@/store/i18nStore'
import type { Job, RecommendedJob, RecommendedJobsResponse } from '@/lib/types'

function normalizeRecommended(payload: RecommendedJobsResponse | undefined, fallbackJobs: Job[] | undefined, suggestedJobFallbackTitle: string) {
  if (!payload && fallbackJobs) {
    return fallbackJobs.map((job) => ({ ...job, match_score: 0, explanation_ar: '' }))
  }

  if (payload?.recommended_jobs?.length) {
    return payload.recommended_jobs
  }

  if (payload?.matches?.length) {
    return payload.matches.map((match) => ({
      ...(match.job ?? { id: match.job_id, title: suggestedJobFallbackTitle }),
      match_score: match.score,
      explanation_ar: match.explanation_ar,
    })) as RecommendedJob[]
  }

  return []
}

export default function DashboardPage() {
  const { t, dir, language } = useTranslation()
  const statsQuery = useDashboardStats()
  const activityQuery = useRecentActivity()
  const recommendedQuery = useRecommendedJobs()
  const saveJob = useSaveJob()

  const stats = statsQuery.data?.data
  const activities = activityQuery.data?.data ?? []
  const fallbackJobs = (recommendedQuery.data as { fallback_jobs?: Job[] } | undefined)?.fallback_jobs
  const recommendations = normalizeRecommended(recommendedQuery.data?.data, fallbackJobs, t('dashboard.suggestedJobFallback')).slice(0, 4)

  if (statsQuery.isLoading || activityQuery.isLoading || recommendedQuery.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size="lg" className="text-[#0F5C5C]" />
      </div>
    )
  }

  return (
    <div className="space-y-6" dir={dir}>
      <section className="rounded-3xl bg-gradient-to-l from-[#0F5C5C] to-[#0C4A4A] p-6 text-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-white/80">{t('dashboard.title')}</p>
            <h1 className="mt-2 text-3xl font-bold">{t('dashboard.heading')}</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/85">
              {t('dashboard.subheading')}
            </p>
          </div>
          <Link
            to="/copilot"
            className={cn(
              'rushd-btn rushd-btn--secondary rushd-btn--md',
              'self-start border-white/30 bg-white/15 text-white backdrop-blur hover:bg-white/25 hover:text-white',
            )}
          >
            {t('dashboard.assistant')}
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            title: t('dashboard.recommendations'),
            value: stats?.recommendations_count ?? 0,
            icon: Briefcase,
          },
          {
            title: t('dashboard.applications'),
            value: stats?.applications_count ?? 0,
            icon: FileText,
          },
          {
            title: t('dashboard.saved'),
            value: stats?.saved_jobs_count ?? 0,
            icon: Bookmark,
          },
          {
            title: t('dashboard.profileCompletion'),
            value: `${stats?.profile_completion ?? 0}%`,
            icon: Star,
          },
        ].map((item) => (
          <Card key={item.title} className="border border-[#E2E8F0]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[#64748B]">{item.title}</p>
                <p className="mt-2 text-3xl font-bold text-[#0F172A]">{item.value}</p>
              </div>
              <div className="rounded-2xl bg-[#E3EFEE] p-3 text-[#0F5C5C]">
                <item.icon className="h-5 w-5" />
              </div>
            </div>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
        <Card className="border border-[#E2E8F0]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#0F172A]">{t('dashboard.topRecommendations')}</h2>
            <Link className="text-sm font-medium text-[#0F5C5C]" to="/jobs">
              {t('dashboard.viewAll')}
            </Link>
          </div>

          <div className="space-y-4">
            {recommendations.length === 0 ? (
              <p className="text-sm text-[#64748B]">
                {t('dashboard.noRecommendations')}
              </p>
            ) : (
              recommendations.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  onSave={(jobId) => saveJob.mutate(jobId)}
                  onUnsave={(jobId) => saveJob.mutate(jobId)}
                />
              ))
            )}
          </div>
        </Card>

        <Card className="border border-[#E2E8F0]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#0F172A]">{t('dashboard.recentActivity')}</h2>
            <span className="text-sm text-[#64748B]">{activities.length} {t('dashboard.items')}</span>
          </div>

          <div className="space-y-4">
            {activities.length === 0 ? (
              <p className="text-sm text-[#64748B]">{t('dashboard.noActivity')}</p>
            ) : (
              activities.map((activity: { type: string; title: string; timestamp: string }, index: number) => (
                <div
                  key={`${activity.type}-${activity.timestamp}-${index}`}
                  className="flex items-start justify-between gap-3 border-b border-[#E2E8F0] pb-3 last:border-b-0 last:pb-0"
                >
                  <div>
                    <p className="font-medium text-[#0F172A]">{activity.title}</p>
                    <p className="mt-1 text-xs text-[#64748B]">{activity.type}</p>
                  </div>
                  <span className="text-xs text-[#64748B]">{formatRelativeDate(activity.timestamp, language)}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </section>
    </div>
  )
}
