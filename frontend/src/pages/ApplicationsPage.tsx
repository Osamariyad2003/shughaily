import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Briefcase,
  ExternalLink,
  GripVertical,
  LayoutGrid,
  List,
  MessageSquare,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { useApplications, useUpdateApplication, useDeleteApplication } from '@/hooks/useApplications'
import { formatRelativeDate } from '@/lib/utils'
import { useTranslation } from '@/store/i18nStore'
import type { TranslationKey } from '@/lib/locales'
import type { Application } from '@/lib/types'

type ViewMode = 'kanban' | 'list'

const PIPELINE_STAGES: { value: string; labelKey: TranslationKey; color: string; lightColor: string }[] = [
  { value: 'saved', labelKey: 'applications.status.saved', color: 'bg-slate-500', lightColor: 'bg-[var(--rushd-surface-alt)] border-[var(--rushd-border-strong)]' },
  { value: 'applied', labelKey: 'applications.status.applied', color: 'bg-blue-500', lightColor: 'bg-blue-50 border-blue-200' },
  { value: 'interviewing', labelKey: 'applications.status.interviewing', color: 'bg-amber-500', lightColor: 'bg-amber-50 border-amber-200' },
  { value: 'offered', labelKey: 'applications.status.offered', color: 'bg-green-500', lightColor: 'bg-green-50 border-green-200' },
  { value: 'rejected', labelKey: 'applications.status.rejected', color: 'bg-red-500', lightColor: 'bg-red-50 border-red-200' },
  { value: 'withdrawn', labelKey: 'applications.status.withdrawn', color: 'bg-slate-400', lightColor: 'bg-[var(--rushd-surface-alt)] border-[var(--rushd-border-strong)]' },
]

const STATUS_FILTERS: { value: string; labelKey: TranslationKey }[] = [
  { value: 'all', labelKey: 'applications.status.all' },
  { value: 'saved', labelKey: 'applications.status.saved' },
  { value: 'applied', labelKey: 'applications.status.applied' },
  { value: 'interviewing', labelKey: 'applications.status.interviewing' },
  { value: 'offered', labelKey: 'applications.status.offered' },
  { value: 'rejected', labelKey: 'applications.status.rejected' },
]

// ─── Notes Modal ─────────────────────────────────────────────────────────────

function NotesModal({
  application,
  onClose,
  onSave,
}: {
  application: Application
  onClose: () => void
  onSave: (notes: string) => void
}) {
  const [notes, setNotes] = useState(application.notes ?? '')
  const { t, dir } = useTranslation()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
        dir={dir}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[#0F172A]">{t('applications.notes.title')} — {application.job_title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[#94A3B8] hover:text-[#0F172A]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <textarea
          className="mb-4 min-h-[160px] w-full rounded-xl border border-[#E2E8F0] bg-[var(--rushd-surface-alt)] p-4 text-sm leading-7 text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#0EA5A4] focus:outline-none"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('applications.notes.placeholder')}
        />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>{t('applications.cancel')}</Button>
          <Button onClick={() => { onSave(notes); onClose() }}>{t('applications.notes.save')}</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Application Card (shared between views) ────────────────────────────────

function ApplicationCard({
  application,
  compact = false,
  onStatusChange,
  onNotesClick,
  onDelete,
}: {
  application: Application
  compact?: boolean
  onStatusChange: (status: string) => void
  onNotesClick: () => void
  onDelete: () => void
}) {
  const { t, language } = useTranslation()

  return (
    <div className={`rounded-xl border bg-white transition-shadow hover:shadow-md ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-start gap-3">
        <div className="hidden text-[#CBD5E1] sm:block">
          <GripVertical className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <Link
            to={`/jobs/${application.job_id}`}
            className={`block font-semibold text-[#0F172A] hover:text-[#0EA5A4] ${compact ? 'text-sm' : 'text-base'}`}
          >
            {application.job_title ?? t('applications.untitledJob')}
          </Link>
          <p className="mt-0.5 text-xs text-[#64748B]">
            {application.company ?? t('common.companyUnspecified')}
            {application.location && ` • ${application.location}`}
          </p>
          <p className="mt-1 text-xs text-[#94A3B8]">{formatRelativeDate(application.updated_at, language)}</p>

          {application.notes && !compact && (
            <p className="mt-2 rounded-lg bg-[var(--rushd-surface-alt)] p-2 text-xs leading-5 text-[#475569]">
              {application.notes.length > 100 ? `${application.notes.slice(0, 100)}...` : application.notes}
            </p>
          )}
        </div>
      </div>

      <div className={`flex flex-wrap items-center gap-2 ${compact ? 'mt-2' : 'mt-3'} border-t border-[#F1F5F9] pt-2`}>
        {!compact && (
          <select
            className="rounded-lg border border-[#E2E8F0] bg-white px-2 py-1 text-xs text-[#0F172A]"
            value={application.status}
            onChange={(e) => onStatusChange(e.target.value)}
          >
            {PIPELINE_STAGES.map((s) => (
              <option key={s.value} value={s.value}>{t(s.labelKey)}</option>
            ))}
          </select>
        )}

        {application.apply_url && (
          <a
            href={application.apply_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md bg-[#0EA5A4] px-2 py-1 text-xs font-medium text-white hover:bg-[#0F766E]"
          >
            <ExternalLink className="h-3 w-3" />
            {t('applications.apply')}
          </a>
        )}

        <button
          type="button"
          onClick={onNotesClick}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
            application.notes
              ? 'bg-amber-50 text-amber-600 hover:bg-amber-100'
              : 'text-[#94A3B8] hover:bg-[var(--rushd-surface-alt)] hover:text-[#0F172A]'
          }`}
        >
          <MessageSquare className="h-3 w-3" />
          {application.notes ? t('applications.notes.title') : t('applications.addNote')}
        </button>

        <button
          type="button"
          onClick={onDelete}
          className="ms-auto rounded-md p-1 text-[#CBD5E1] transition-colors hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Kanban View ─────────────────────────────────────────────────────────────

function KanbanView({
  applications,
  onStatusChange,
  onNotesClick,
  onDelete,
}: {
  applications: Application[]
  onStatusChange: (id: string, status: string) => void
  onNotesClick: (app: Application) => void
  onDelete: (id: string) => void
}) {
  const { t } = useTranslation()
  const grouped = PIPELINE_STAGES.map((stage) => ({
    ...stage,
    apps: applications.filter((a) => a.status === stage.value),
  }))

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {grouped.map((stage) => (
        <div
          key={stage.value}
          className={`min-w-[280px] flex-1 rounded-2xl border p-3 ${stage.lightColor}`}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`h-2.5 w-2.5 rounded-full ${stage.color}`} />
              <h3 className="text-sm font-semibold text-[#0F172A]">{t(stage.labelKey)}</h3>
            </div>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-[#64748B] shadow-sm">
              {stage.apps.length}
            </span>
          </div>

          <div className="space-y-2">
            {stage.apps.map((app) => (
              <ApplicationCard
                key={app.id}
                application={app}
                compact
                onStatusChange={(status) => onStatusChange(app.id, status)}
                onNotesClick={() => onNotesClick(app)}
                onDelete={() => onDelete(app.id)}
              />
            ))}

            {stage.apps.length === 0 && (
              <div className="rounded-xl border border-dashed border-[#CBD5E1]/60 py-8 text-center">
                <p className="text-xs text-[var(--rushd-ink-soft)]">{t('applications.noApplicationsInStage')}</p>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── List View ───────────────────────────────────────────────────────────────

function ListView({
  applications,
  statusFilter,
  onStatusChange,
  onNotesClick,
  onDelete,
}: {
  applications: Application[]
  statusFilter: string
  onStatusChange: (id: string, status: string) => void
  onNotesClick: (app: Application) => void
  onDelete: (id: string) => void
}) {
  const { t } = useTranslation()
  const filtered = statusFilter === 'all'
    ? applications
    : applications.filter((a) => a.status === statusFilter)

  return (
    <div className="space-y-3">
      {filtered.map((app) => (
        <ApplicationCard
          key={app.id}
          application={app}
          onStatusChange={(status) => onStatusChange(app.id, status)}
          onNotesClick={() => onNotesClick(app)}
          onDelete={() => onDelete(app.id)}
        />
      ))}

      {filtered.length === 0 && (
        <Card className="border border-dashed border-[#CBD5E1] py-12 text-center">
          <Briefcase className="mx-auto h-8 w-8 text-[#CBD5E1]" />
          <p className="mt-3 text-sm text-[#64748B]">{t('applications.noApplications')}</p>
          <Link
            to="/jobs"
            className="mt-3 inline-block text-sm font-medium text-[#0EA5A4] hover:text-[#0F766E]"
          >
            {t('applications.browseJobs')}
          </Link>
        </Card>
      )}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ApplicationsPage() {
  const { t, dir } = useTranslation()
  const [view, setView] = useState<ViewMode>('kanban')
  const [statusFilter, setStatusFilter] = useState('all')
  const [notesApp, setNotesApp] = useState<Application | null>(null)
  const applicationsQuery = useApplications()
  const updateApplication = useUpdateApplication()
  const deleteApplication = useDeleteApplication()

  const applications = applicationsQuery.data?.data ?? []

  const handleStatusChange = (id: string, status: string) => {
    updateApplication.mutate({ id, data: { status } })
  }

  const handleSaveNotes = (notes: string) => {
    if (!notesApp) return
    updateApplication.mutate({ id: notesApp.id, data: { notes } })
  }

  const handleDelete = (id: string) => {
    deleteApplication.mutate(id)
  }

  // Stats summary
  const totalApps = applications.length
  const appliedCount = applications.filter((a) => a.status === 'applied').length
  const interviewCount = applications.filter((a) => a.status === 'interviewing').length
  const offeredCount = applications.filter((a) => a.status === 'offered').length

  if (applicationsQuery.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size="lg" className="text-[#0EA5A4]" />
      </div>
    )
  }

  return (
    <div className="space-y-6" dir={dir}>
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#0F172A]">{t('applications.title')}</h1>
          <p className="mt-2 text-sm text-[#64748B]">
            {t('applications.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-[var(--rushd-surface-alt)] p-1">
            <button
              type="button"
              onClick={() => setView('kanban')}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                view === 'kanban' ? 'bg-white text-[#0F172A] shadow-sm' : 'text-[#64748B]'
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                view === 'list' ? 'bg-white text-[#0F172A] shadow-sm' : 'text-[#64748B]'
              }`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          <Link to="/jobs">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              {t('applications.searchJobs')}
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4">
          <p className="text-xs text-[#64748B]">{t('applications.stats.total')}</p>
          <p className="mt-1 text-2xl font-bold text-[#0F172A]">{totalApps}</p>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-xs text-blue-600">{t('applications.stats.applied')}</p>
          <p className="mt-1 text-2xl font-bold text-blue-700">{appliedCount}</p>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
          <p className="text-xs text-amber-600">{t('applications.stats.interviewing')}</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{interviewCount}</p>
        </div>
        <div className="rounded-2xl border border-green-100 bg-green-50 p-4">
          <p className="text-xs text-green-600">{t('applications.stats.offered')}</p>
          <p className="mt-1 text-2xl font-bold text-green-700">{offeredCount}</p>
        </div>
      </div>

      {/* List view filter tabs */}
      {view === 'list' && (
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((item) => {
            const count = item.value === 'all'
              ? totalApps
              : applications.filter((a) => a.status === item.value).length
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setStatusFilter(item.value)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  statusFilter === item.value
                    ? 'bg-[#0EA5A4] text-white'
                    : 'bg-[var(--rushd-surface-alt)] text-[var(--rushd-ink-soft)] hover:text-[#0F172A]'
                }`}
              >
                {t(item.labelKey)}
                {count > 0 && (
                  <span className={`ms-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs ${
                    statusFilter === item.value ? 'bg-white/20' : 'bg-[#E2E8F0]'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Content */}
      {view === 'kanban' ? (
        <KanbanView
          applications={applications}
          onStatusChange={handleStatusChange}
          onNotesClick={setNotesApp}
          onDelete={handleDelete}
        />
      ) : (
        <ListView
          applications={applications}
          statusFilter={statusFilter}
          onStatusChange={handleStatusChange}
          onNotesClick={setNotesApp}
          onDelete={handleDelete}
        />
      )}

      {/* Notes modal */}
      {notesApp && (
        <NotesModal
          application={notesApp}
          onClose={() => setNotesApp(null)}
          onSave={handleSaveNotes}
        />
      )}
    </div>
  )
}
