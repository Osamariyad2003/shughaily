import { Link } from 'react-router-dom'
import { Bookmark, Briefcase, FileText, Star } from 'lucide-react'
import Card from '@/components/ui/Card'
import Spinner from '@/components/ui/Spinner'
import MatchScore from '@/components/ui/MatchScore'
import { useDashboardStats, useRecentActivity } from '@/hooks/useDashboard'
import { useRecommendedJobs } from '@/hooks/useJobs'
import { formatRelativeDate, truncateText } from '@/lib/utils'
import type { Job, RecommendedJob, RecommendedJobsResponse } from '@/lib/types'

function normalizeRecommended(payload?: RecommendedJobsResponse, fallbackJobs?: Job[]) {
  if (!payload && fallbackJobs) {
    return fallbackJobs.map((job) => ({ ...job, match_score: 0, explanation_ar: '' }))
  }

  if (payload?.recommended_jobs?.length) {
    return payload.recommended_jobs
  }

  if (payload?.matches?.length) {
    return payload.matches.map((match) => ({
      ...(match.job ?? { id: match.job_id, title: 'وظيفة مقترحة' }),
      match_score: match.score,
      explanation_ar: match.explanation_ar,
    })) as RecommendedJob[]
  }

  return []
}

export default function DashboardPage() {
  const statsQuery = useDashboardStats()
  const activityQuery = useRecentActivity()
  const recommendedQuery = useRecommendedJobs()

  const stats = statsQuery.data?.data
  const activities = activityQuery.data?.data ?? []
  const fallbackJobs = (recommendedQuery.data as { fallback_jobs?: Job[] } | undefined)?.fallback_jobs
  const recommendations = normalizeRecommended(recommendedQuery.data?.data, fallbackJobs).slice(0, 4)

  if (statsQuery.isLoading || activityQuery.isLoading || recommendedQuery.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size="lg" className="text-[#0EA5A4]" />
      </div>
    )
  }

  return (
    <div className="space-y-6" dir="rtl">
      <section className="rounded-3xl bg-gradient-to-l from-[#0EA5A4] to-[#06B6D4] p-6 text-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-white/80">لوحة الشغيلي</p>
            <h1 className="mt-2 text-3xl font-bold">رحلة التوظيف الخاصة بك في مكان واحد</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/85">
              تابع سيرتك الذاتية، راقب طلباتك، واكتشف توصيات جديدة مبنية على ملفك وتفضيلاتك.
            </p>
          </div>
          <Link
            className="inline-flex items-center gap-2 self-start rounded-xl bg-white/15 px-4 py-2 text-sm font-medium backdrop-blur"
            to="/copilot"
          >
            المساعد
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            title: 'التوصيات',
            value: stats?.recommendations_count ?? 0,
            icon: Briefcase,
          },
          {
            title: 'الطلبات',
            value: stats?.applications_count ?? 0,
            icon: FileText,
          },
          {
            title: 'المحفوظات',
            value: stats?.saved_jobs_count ?? 0,
            icon: Bookmark,
          },
          {
            title: 'اكتمال الملف',
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
              <div className="rounded-2xl bg-[#CCFBF1] p-3 text-[#0EA5A4]">
                <item.icon className="h-5 w-5" />
              </div>
            </div>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
        <Card className="border border-[#E2E8F0]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#0F172A]">أفضل التوصيات الحالية</h2>
            <Link className="text-sm font-medium text-[#0EA5A4]" to="/jobs">
              مشاهدة الكل
            </Link>
          </div>

          <div className="space-y-4">
            {recommendations.length === 0 ? (
              <p className="text-sm text-[#64748B]">
                لا توجد توصيات بعد. ارفع سيرة ذاتية ثم أعد تحديث الصفحة.
              </p>
            ) : (
              recommendations.map((job) => (
                <Link
                  key={job.id}
                  className="block rounded-2xl border border-[#E2E8F0] p-4 transition-colors hover:border-[#0EA5A4]/30"
                  to={`/jobs/${job.id}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-[#0F172A]">{job.title}</h3>
                      <p className="mt-1 text-sm text-[#64748B]">
                        {job.company ?? 'شركة غير محددة'}{job.location ? ` • ${job.location}` : ''}
                      </p>
                    </div>
                    {typeof job.match_score === 'number' && (
                      <div className="min-w-32">
                        <MatchScore score={job.match_score} />
                      </div>
                    )}
                  </div>
                  {job.explanation_ar && (
                    <p className="mt-3 text-sm leading-6 text-[#475569]">
                      {truncateText(job.explanation_ar, 140)}
                    </p>
                  )}
                </Link>
              ))
            )}
          </div>
        </Card>

        <Card className="border border-[#E2E8F0]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#0F172A]">النشاط الأخير</h2>
            <span className="text-sm text-[#64748B]">{activities.length} عنصر</span>
          </div>

          <div className="space-y-4">
            {activities.length === 0 ? (
              <p className="text-sm text-[#64748B]">لا يوجد نشاط حديث بعد.</p>
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
                  <span className="text-xs text-[#64748B]">{formatRelativeDate(activity.timestamp)}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </section>
    </div>
  )
}
