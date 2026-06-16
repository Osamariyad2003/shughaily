import { Link } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import { useSavedJobs } from '@/hooks/useJobs'
import { truncateText } from '@/lib/utils'

export default function SavedJobsPage() {
  const savedJobsQuery = useSavedJobs()
  const jobs = savedJobsQuery.data?.data ?? []

  if (savedJobsQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner size="lg" className="text-[#0EA5A4]" />
      </div>
    )
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-3xl font-bold text-[#0F172A]">الوظائف المحفوظة</h1>
        <p className="mt-2 text-sm text-[#64748B]">
          ارجع إلى الفرص التي أثارت اهتمامك وقرر أيها يستحق التقديم عليه أولاً.
        </p>
      </div>

      <div className="grid gap-4">
        {jobs.map((job) => (
          <Card key={job.id} className="border border-[#E2E8F0]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Link className="text-lg font-semibold text-[#0F172A]" to={`/jobs/${job.id}`}>
                  {job.title}
                </Link>
                <p className="mt-1 text-sm text-[#64748B]">
                  {job.company ?? 'شركة غير محددة'}{job.location ? ` • ${job.location}` : ''}
                </p>
              </div>
              {job.employment_type && <Badge variant="neutral">{job.employment_type}</Badge>}
            </div>

            <p className="mt-4 text-sm leading-6 text-[#475569]">
              {truncateText(job.description ?? 'لا يوجد وصف متاح حالياً.', 220)}
            </p>
          </Card>
        ))}

        {jobs.length === 0 && (
          <Card className="border border-dashed border-[#CBD5E1] text-center text-sm text-[#64748B]">
            لم تحفظ أي وظيفة بعد.
          </Card>
        )}
      </div>
    </div>
  )
}
