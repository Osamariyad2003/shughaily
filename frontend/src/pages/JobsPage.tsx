import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  Bookmark,
  Building2,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  Filter,
  Globe,
  MapPin,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Settings,
  Target,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react'

import SearchAgentBuilderModal from '@/components/jobs/SearchAgentBuilderModal'
import Badge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import Spinner from '@/components/ui/Spinner'
import { Button } from '@/components/rushd'
import { useCreateApplication } from '@/hooks/useApplications'
import { useDashboardStats } from '@/hooks/useDashboard'
import { useRecommendedJobs, useSaveJob } from '@/hooks/useJobs'
import {
  useCandidateProfileSummary,
  useCreateSearchAgent,
  useDeleteSearchAgent,
  useRunSearchAgent,
  useSearchAgents,
  useUpdateSearchAgent,
} from '@/hooks/useSearchAgents'
import { jobsService } from '@/services/jobs.service'
import { cn, truncateText } from '@/lib/utils'
import { useTranslation } from '@/store/i18nStore'
import type { TranslationKey } from '@/lib/locales'
import type { Job, RecommendedJob, SearchAgent, SearchAgentInput } from '@/lib/types'

const SOURCE_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  google_jobs: 'Google Jobs',
  remotive: 'Remotive',
  remoteok: 'RemoteOK',
  arbeitnow: 'Arbeitnow',
  themuse: 'The Muse',
}

type TabKey = 'recommended' | 'all' | 'high-match' | 'saved' | 'applied'

const TABS: { key: TabKey; labelKey: TranslationKey; icon: typeof Target }[] = [
  { key: 'recommended', labelKey: 'jobs.tabs.recommended', icon: Target },
  { key: 'all', labelKey: 'jobs.tabs.all', icon: Globe },
  { key: 'high-match', labelKey: 'jobs.tabs.highMatch', icon: TrendingUp },
  { key: 'saved', labelKey: 'jobs.tabs.saved', icon: Bookmark },
  { key: 'applied', labelKey: 'jobs.tabs.applied', icon: CheckCircle2 },
]

function timeAgo(iso: string | undefined, t: (key: TranslationKey, vars?: Record<string, string | number>) => string, locale: 'ar' | 'en'): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return t('jobs.timeAgo.now')
  if (mins < 60) return t('jobs.timeAgo.minutes', { n: mins })
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return t('jobs.timeAgo.hours', { n: hrs })
  const days = Math.floor(hrs / 24)
  if (days < 7) return t('jobs.timeAgo.days', { n: days })
  return new Date(iso).toLocaleDateString(locale === 'en' ? 'en-US' : 'ar-SA')
}

function matchTone(score?: number): { bg: string; text: string; ring: string } {
  if (!score && score !== 0) return { bg: 'bg-[var(--rushd-surface-alt)]', text: 'text-[var(--rushd-ink-soft)]', ring: 'ring-[var(--rushd-border-strong)]' }
  if (score >= 80) return { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200' }
  if (score >= 60) return { bg: 'bg-[#E3EFEE]', text: 'text-[#0F5C5C]', ring: 'ring-[#0F5C5C]/20' }
  if (score >= 40) return { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200' }
  return { bg: 'bg-rose-50', text: 'text-rose-700', ring: 'ring-rose-200' }
}

function formatAgentSubline(agent: SearchAgent, allModesLabel: string): string {
  const titles = agent.target_titles.slice(0, 2).join(' • ')
  const locations = agent.preferred_locations.slice(0, 2).join(' • ')
  const workModes = agent.work_modes.length > 0 ? agent.work_modes.join(' • ') : allModesLabel
  return [titles, locations, workModes].filter(Boolean).join(' • ')
}

function buildSearchInputFromAgent(agent: SearchAgent, remoteLabel: string): string {
  const parts = [
    agent.target_titles.join(' / '),
    agent.preferred_locations[0],
    agent.work_modes.includes('remote') ? remoteLabel : '',
  ].filter(Boolean)

  return parts.join(' • ')
}

function HeroSection({ onCreateAgent, onBrowse }: { onCreateAgent: () => void; onBrowse: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="relative overflow-hidden rounded-3xl border border-[#E2E8F0] bg-gradient-to-bl from-[#0F5C5C] via-[#0C4A4A] to-[#14201E] p-8 text-white shadow-lg md:p-10">
      <div className="absolute -left-12 -top-12 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute -bottom-16 -right-8 h-56 w-56 rounded-full bg-emerald-300/10 blur-3xl" />
      <div className="relative max-w-3xl">
        <h1 className="mt-2 text-3xl font-bold leading-tight md:text-4xl">
          {t('jobs.hero.title')}
        </h1>
        <p className="mt-3 text-base text-[#E3EFEE] md:text-lg">
          {t('jobs.hero.description')}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            onClick={onCreateAgent}
            variant="secondary"
            icon={<Plus className="h-4 w-4" />}
            className="border-transparent bg-white text-[#0F5C5C] shadow-sm hover:bg-[#E3EFEE]"
          >
            {t('jobs.hero.createAgent')}
          </Button>
          <Button
            onClick={onBrowse}
            variant="ghost"
            icon={<Search className="h-4 w-4" />}
            className="border border-white/30 bg-white/10 text-white backdrop-blur hover:bg-white/20 hover:text-white"
          >
            {t('jobs.hero.browseManually')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function SmartSearchBar({
  value,
  onChange,
  onSubmit,
  loading,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  loading: boolean
}) {
  const { t } = useTranslation()
  const chips: TranslationKey[] = ['jobs.search.title', 'jobs.search.location', 'jobs.search.remote', 'jobs.search.salaryRange', 'jobs.search.requiredKeywords', 'jobs.search.excludedKeywords']

  return (
    <Card className="border border-[#E2E8F0] bg-white p-5">
      <div className="flex items-center gap-3 rounded-2xl border border-[#E2E8F0] bg-[var(--rushd-surface-alt)] px-4 py-3 transition focus-within:border-[#0F5C5C] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#0F5C5C]/20">
        <Search className="h-5 w-5 shrink-0 text-[#0F5C5C]" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
          placeholder={t('jobs.search.placeholder')}
          className="flex-1 bg-transparent text-sm text-[#0F172A] outline-none placeholder:text-[#94A3B8]"
        />
        <Button onClick={onSubmit} disabled={loading} icon={loading ? <Spinner size="sm" /> : <Search className="h-4 w-4" />}>
          {t('jobs.search.submit')}
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((chipKey) => (
          <button
            key={chipKey}
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white px-3 py-1 text-xs font-medium text-[#475569] transition hover:border-[#0F5C5C] hover:text-[#0F5C5C]"
          >
            <Filter className="h-3 w-3" />
            {t(chipKey)}
          </button>
        ))}
      </div>
    </Card>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  tone,
}: {
  icon: typeof Target
  label: string
  value: string | number
  trend?: string
  tone: 'teal' | 'emerald' | 'violet' | 'amber'
}) {
  const tones = {
    teal: 'from-[#E3EFEE] to-[#E3EFEE]/40 text-[#0F5C5C] ring-[#0F5C5C]/20',
    emerald: 'from-emerald-50 to-emerald-100/40 text-emerald-700 ring-emerald-200',
    violet: 'from-violet-50 to-violet-100/40 text-violet-700 ring-violet-200',
    amber: 'from-amber-50 to-amber-100/40 text-amber-700 ring-amber-200',
  } as const

  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-[#64748B]">{label}</p>
          <p className="mt-1.5 text-2xl font-bold text-[#0F172A]">{value}</p>
          {trend && <p className="mt-1 text-xs text-emerald-600">{trend}</p>}
        </div>
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ring-1', tones[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}

function AgentCard({
  agent,
  onToggle,
  onEdit,
  onDelete,
  onView,
}: {
  agent: SearchAgent
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onView: () => void
}) {
  const { t, language } = useTranslation()
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br from-[#E3EFEE] to-transparent opacity-60" />
      <div className="relative">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E3EFEE] text-[#0F5C5C] ring-1 ring-[#0F5C5C]/20">
              <Search className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#0F172A]">{agent.name}</h3>
              <p className="mt-0.5 text-xs text-[#64748B]">{formatAgentSubline(agent, t('jobs.allWorkModes')) || t('jobs.agent.allTitlesLocationsModes')}</p>
            </div>
          </div>
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1', agent.active ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-[var(--rushd-surface-alt)] text-[var(--rushd-ink-soft)] ring-[var(--rushd-border-strong)]')}>
            <span className={cn('h-1.5 w-1.5 rounded-full', agent.active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400')} />
            {agent.active ? t('jobs.agent.active') : t('jobs.agent.stopped')}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-xl bg-[var(--rushd-surface-alt)] p-3">
            <p className="text-[10px] font-medium text-[var(--rushd-ink-soft)]">{t('jobs.agent.newToday')}</p>
            <p className="mt-1 text-lg font-bold text-[#0F172A]">{agent.new_jobs_count}</p>
          </div>
          <div className="rounded-xl bg-[#E3EFEE] p-3 ring-1 ring-[#0F5C5C]/15">
            <p className="text-[10px] font-medium text-[#0F5C5C]">{t('jobs.agent.avgMatch')}</p>
            <p className="mt-1 text-lg font-bold text-[#0F5C5C]">{Math.round(agent.avg_match_score)}%</p>
          </div>
        </div>

        {agent.last_run_at && (
          <p className="mt-3 text-center text-[10px] text-[#94A3B8]">
            {t('jobs.agent.lastRun', { time: timeAgo(agent.last_run_at, t, language) })}
            {agent.active && <span className="mx-1">{t('jobs.agent.autoRunsEvery2h')}</span>}
          </p>
        )}
        {!agent.last_run_at && agent.active && (
          <p className="mt-3 text-center text-[10px] text-[#94A3B8]">
            {t('jobs.agent.notRunYet')}
          </p>
        )}

        <div className="mt-3 flex items-center gap-2">
          <Button onClick={onView} size="sm" className="flex-1">
            {t('jobs.agent.viewResults')}
          </Button>
          <Button
            onClick={onToggle}
            title={agent.active ? t('jobs.agent.stop') : t('jobs.agent.start')}
            aria-label={agent.active ? t('jobs.agent.stopAgent') : t('jobs.agent.startAgent')}
            variant="secondary"
            size="sm"
            icon={agent.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          />
          <Button
            onClick={onEdit}
            title={t('jobs.agent.edit')}
            aria-label={t('jobs.agent.editAgent')}
            variant="secondary"
            size="sm"
            icon={<Pencil className="h-3.5 w-3.5" />}
            className="hover:border-amber-300 hover:text-amber-600"
          />
          <Button
            onClick={onDelete}
            title={t('jobs.agent.delete')}
            aria-label={t('jobs.agent.deleteAgent')}
            variant="secondary"
            size="sm"
            icon={<X className="h-3.5 w-3.5" />}
            className="hover:border-rose-300 hover:text-rose-600"
          />
        </div>
      </div>
    </div>
  )
}

function NewAgentCard({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <button onClick={onClick} className="group flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#CBD5E1] bg-white/50 p-5 text-[#64748B] transition hover:border-[#0F5C5C] hover:bg-[#E3EFEE]/40 hover:text-[#0C4A4A]">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E3EFEE] text-[#0F5C5C] ring-1 ring-[#0F5C5C]/20 transition group-hover:scale-110">
        <Plus className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-semibold">{t('jobs.newAgentCard.title')}</p>
      <p className="mt-0.5 text-xs">{t('jobs.newAgentCard.subtitle')}</p>
    </button>
  )
}

function JobListItem({
  job,
  selected,
  onSelect,
  onSave,
  onHide,
  onApply,
}: {
  job: RecommendedJob
  selected: boolean
  onSelect: () => void
  onSave: () => void
  onHide: () => void
  onApply: () => void
}) {
  const { t, language } = useTranslation()
  const score = job.match_score
  const tone = matchTone(score)

  return (
    <div
      onClick={onSelect}
      className={cn(
        'group cursor-pointer rounded-2xl border bg-white p-4 transition',
        selected
          ? 'border-[#0F5C5C] bg-[#E3EFEE]/30 shadow-md ring-2 ring-[#0F5C5C]/20'
          : 'border-[#E2E8F0] hover:border-[#94A3B8] hover:shadow-sm',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold text-[#0F172A]">{job.title}</h3>
          <p className="mt-0.5 truncate text-xs text-[#64748B]">
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              {job.company ?? t('common.companyUnspecified')}
            </span>
            {job.location && (
              <>
                <span className="mx-1.5">•</span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {job.location}
                </span>
              </>
            )}
          </p>
        </div>
        {score !== undefined && (
          <div className={cn('shrink-0 rounded-xl px-2.5 py-1 text-center ring-1', tone.bg, tone.ring)}>
            <p className={cn('text-sm font-bold leading-none', tone.text)}>{Math.round(score)}%</p>
            <p className={cn('mt-0.5 text-[9px] font-medium', tone.text)}>{t('jobs.jobItem.match')}</p>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {job.employment_type && <Badge variant="neutral">{job.employment_type}</Badge>}
        {job.source && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--rushd-surface-alt)] px-2 py-0.5 text-[10px] text-[var(--rushd-ink-soft)]">
            <Globe className="h-2.5 w-2.5" />
            {SOURCE_LABELS[job.source] ?? job.source.replace('_', ' ')}
          </span>
        )}
        <span className="ms-auto inline-flex items-center gap-1 text-[10px] text-[#94A3B8]">
          <Clock className="h-2.5 w-2.5" />
          {timeAgo(job.created_at, t, language)}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-[#F1F5F9] pt-3 opacity-0 transition group-hover:opacity-100">
        {job.apply_url ? (
          <a
            href={job.apply_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.stopPropagation()
              onApply()
            }}
            className="rushd-btn rushd-btn--primary rushd-btn--sm"
          >
            <ExternalLink className="h-3 w-3" /> {t('jobs.jobItem.apply')}
          </a>
        ) : (
          <Button
            onClick={(e) => {
              e.stopPropagation()
              onApply()
            }}
            size="sm"
            icon={<ExternalLink className="h-3 w-3" />}
          >
            {t('jobs.jobItem.apply')}
          </Button>
        )}
        <Button
          onClick={(e) => {
            e.stopPropagation()
            onSave()
          }}
          variant="secondary"
          size="sm"
          icon={<Bookmark className="h-3 w-3" />}
        >
          {t('jobs.jobItem.save')}
        </Button>
        <Button
          onClick={(e) => {
            e.stopPropagation()
            onHide()
          }}
          variant="secondary"
          size="sm"
          icon={<EyeOff className="h-3 w-3" />}
          className="hover:border-rose-300 hover:text-rose-600"
        >
          {t('jobs.jobItem.hide')}
        </Button>
      </div>
    </div>
  )
}

function JobDetailsPanel({
  job,
  onApply,
  onSave,
}: {
  job: RecommendedJob | null
  onApply: () => void
  onSave: () => void
}) {
  const { t } = useTranslation()

  if (!job) {
    return (
      <Card className="sticky top-6 flex min-h-[400px] flex-col items-center justify-center border border-dashed border-[#CBD5E1] text-center">
        <Eye className="h-10 w-10 text-[#CBD5E1]" />
        <p className="mt-3 text-sm font-medium text-[#0F172A]">{t('jobs.details.selectPrompt')}</p>
        <p className="mt-1 text-xs text-[#64748B]">{t('jobs.details.selectHint')}</p>
      </Card>
    )
  }

  const score = job.match_score
  const tone = matchTone(score)

  return (
    <Card className="sticky top-6 border border-[#E2E8F0] p-0">
      <div className="border-b border-[#F1F5F9] p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-[#0F172A]">{job.title}</h2>
            <p className="mt-1 text-sm text-[#64748B]">{job.company ?? t('common.companyUnspecified')}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#475569]">
              {job.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {job.location}
                </span>
              )}
              {job.employment_type && (
                <>
                  <span>•</span>
                  <span>{job.employment_type}</span>
                </>
              )}
              {job.salary_text && (
                <>
                  <span>•</span>
                  <span className="font-semibold text-[#0F5C5C]">{job.salary_text}</span>
                </>
              )}
            </div>
          </div>
          {score !== undefined && (
            <div className={cn('flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl ring-2', tone.bg, tone.ring)}>
              <p className={cn('text-xl font-bold leading-none', tone.text)}>{Math.round(score)}%</p>
              <p className={cn('mt-0.5 text-[9px] font-semibold', tone.text)}>{t('jobs.jobItem.match')}</p>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 p-5">
        {job.explanation_ar && (
          <div className="rounded-xl bg-gradient-to-bl from-[#E3EFEE] to-emerald-50/50 p-4 ring-1 ring-[#0F5C5C]/15">
            <p className="flex items-center gap-1.5 text-xs font-bold text-[#0F5C5C]">
              {t('jobs.details.whyFits')}
            </p>
            <p className="mt-2 text-xs leading-6 text-[#334155]">{job.explanation_ar}</p>
          </div>
        )}

        {job.matched_skills && job.matched_skills.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[#0F172A]">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              {t('jobs.details.matchedSkills')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(new Set(job.matched_skills)).slice(0, 12).map((skill, index) => (
                <Badge key={`${skill}-${index}`} variant="success">
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {job.missing_skills && job.missing_skills.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[#0F172A]">
              <Target className="h-3.5 w-3.5 text-amber-600" />
              {t('jobs.details.skillsToHighlight')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(new Set(job.missing_skills)).slice(0, 8).map((skill, index) => (
                <Badge key={`${skill}-${index}`} variant="warning">
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {job.description && (
          <div>
            <p className="mb-2 text-xs font-bold text-[#0F172A]">{t('jobs.details.description')}</p>
            <p className="text-xs leading-6 text-[#475569]">{truncateText(job.description, 320)}</p>
            <Link to={`/jobs/${job.id}`} className="mt-2 inline-block text-xs font-semibold text-[#0F5C5C] hover:text-[#0C4A4A]">
              {t('jobs.details.readFull')}
            </Link>
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-[#F1F5F9] bg-[var(--rushd-surface-alt)] p-4">
        <div className="grid grid-cols-2 gap-2">
          {job.apply_url ? (
            <a
              href={job.apply_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onApply}
              className="rushd-btn rushd-btn--primary rushd-btn--md col-span-2"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t('jobs.details.applyOnJob')}
            </a>
          ) : (
            <Link to={`/jobs/${job.id}`} className="rushd-btn rushd-btn--primary rushd-btn--md col-span-2">
              <ExternalLink className="h-3.5 w-3.5" />
              {t('jobs.details.viewJob')}
            </Link>
          )}
          <Link to="/resume" className="rushd-btn rushd-btn--secondary rushd-btn--sm">
            <FileText className="h-3 w-3" />
            {t('jobs.details.tailorResume')}
          </Link>
          <Link to={`/jobs/${job.id}#cover-letter`} className="rushd-btn rushd-btn--secondary rushd-btn--sm">
            <Zap className="h-3 w-3" />
            {t('jobs.details.coverLetter')}
          </Link>
        </div>
        <Button onClick={onSave} variant="secondary" size="sm" icon={<Bookmark className="h-3 w-3" />} className="w-full">
          {t('jobs.details.saveToList')}
        </Button>
      </div>
    </Card>
  )
}

export default function JobsPage() {
  const { t, dir } = useTranslation()
  const [searchInput, setSearchInput] = useState('')
  const [activeTab, setActiveTab] = useState<TabKey>('recommended')
  const [externalJobs, setExternalJobs] = useState<RecommendedJob[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<SearchAgent | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [lastSearchLabel, setLastSearchLabel] = useState<string>('')
  const [sourceFilter, setSourceFilter] = useState<Set<string>>(new Set())

  const recommended = useRecommendedJobs()
  const stats = useDashboardStats()
  const saveJob = useSaveJob()
  const createApplication = useCreateApplication()
  const agentsQuery = useSearchAgents()
  const profileSummary = useCandidateProfileSummary()
  const createAgent = useCreateSearchAgent()
  const updateAgent = useUpdateSearchAgent()
  const deleteAgent = useDeleteSearchAgent()
  const runAgent = useRunSearchAgent()

  const agents = agentsQuery.data?.data ?? []

  const recommendedJobs: RecommendedJob[] = useMemo(() => {
    const data = recommended.data?.data
    if (!data) return []
    if (data.recommended_jobs?.length) return data.recommended_jobs
    if (data.matches?.length) {
      return data.matches
        .filter((match) => match.job)
        .map((match) => ({
          ...(match.job as Job),
          match_score: match.score,
          matched_skills: match.matched_skills,
          missing_skills: match.missing_skills,
          explanation_ar: match.explanation_ar,
        }))
    }
    return []
  }, [recommended.data])

  const externalAsRecommended: RecommendedJob[] = externalJobs

  const visibleJobs = useMemo(() => {
    let list: RecommendedJob[] = []
    if (activeTab === 'recommended') list = recommendedJobs
    else if (activeTab === 'all') {
      // After a search has run, always show external results (even if empty).
      // Only fall back to recommendations when no search has happened yet.
      list = lastSearchLabel ? externalAsRecommended : recommendedJobs
    }
    else if (activeTab === 'high-match') list = recommendedJobs.filter((job) => (job.match_score ?? 0) >= 70)
    else list = recommendedJobs
    return list.filter((job) => {
      if (hidden.has(job.id)) return false
      if (sourceFilter.size > 0 && job.source && !sourceFilter.has(job.source)) return false
      return true
    })
  }, [activeTab, recommendedJobs, externalAsRecommended, lastSearchLabel, hidden, sourceFilter])

  const selectedJob = useMemo(
    () => visibleJobs.find((job) => job.id === selectedJobId) ?? visibleJobs[0] ?? null,
    [visibleJobs, selectedJobId],
  )

  const runSearch = async (params: {
    q: string
    location?: string
    remote?: boolean
    employment_type?: string
  }, label?: string) => {
    setSearchLoading(true)
    setSearchError('')
    setActiveTab('all')
    setLastSearchLabel(label || params.q)
    setHidden(new Set())
    try {
      const res = await jobsService.searchExternal(params)
      const jobs = res.data ?? []
      setExternalJobs(jobs)
      // Auto-select the first result so the details panel updates immediately.
      setSelectedJobId(jobs[0]?.id ?? null)
    } catch (err) {
      setExternalJobs([])
      setSelectedJobId(null)
      setSearchError(err instanceof Error ? err.message : t('jobs.error.searchFailed'))
    } finally {
      setSearchLoading(false)
    }
  }

  const clearSearch = () => {
    setExternalJobs([])
    setLastSearchLabel('')
    setSearchError('')
    setSelectedJobId(null)
    setActiveTab('recommended')
    setSourceFilter(new Set())
  }

  const handleSearch = async () => {
    if (!searchInput.trim()) return
    const parts = searchInput.split('•').map((part) => part.trim()).filter(Boolean)
    const q = parts[0] || searchInput.trim()
    const location = parts[1]
    // Recognize both Arabic and English remote/work-type markers regardless
    // of the current UI language, since a query typed earlier (or pasted)
    // may still contain the other language's wording.
    const remote = parts.some((part) => part.includes('عن بُعد') || /remote/i.test(part))
    const employmentType = parts.find((part) => /دوام/.test(part) || /full[\s-]?time|part[\s-]?time|contract/i.test(part))

    await runSearch(
      {
        q,
        location,
        remote,
        employment_type: employmentType,
      },
      [q, location].filter(Boolean).join(' • '),
    )
  }

  const handleCreateAgent = async (payload: SearchAgentInput) => {
    if (editingAgent) {
      await updateAgent.mutateAsync({ id: editingAgent.id, payload })
      setEditingAgent(null)
    } else {
      await createAgent.mutateAsync(payload)
    }
  }

  const handleOpenAgent = async (agent: SearchAgent) => {
    setSearchInput(buildSearchInputFromAgent(agent, t('jobs.remote')))
    setSearchLoading(true)
    setSearchError('')
    setActiveTab('all')
    setLastSearchLabel(t('jobs.agentPrefix', { name: agent.name }))
    setHidden(new Set())
    try {
      const res = await runAgent.mutateAsync(agent.id)
      const jobs = res.data?.jobs ?? []
      setExternalJobs(jobs)
      setSelectedJobId(jobs[0]?.id ?? null)
    } catch (err) {
      setExternalJobs([])
      setSelectedJobId(null)
      setSearchError(err instanceof Error ? err.message : t('jobs.error.agentRunFailed'))
    } finally {
      setSearchLoading(false)
      document.getElementById('job-list-section')?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const tabCounts = useMemo(() => {
    const high = recommendedJobs.filter((job) => (job.match_score ?? 0) >= 70).length
    return {
      recommended: recommendedJobs.length,
      all: lastSearchLabel ? externalJobs.length : recommendedJobs.length,
      'high-match': high,
      saved: stats.data?.data?.saved_jobs_count ?? 0,
      applied: stats.data?.data?.applications_count ?? 0,
    } as Record<TabKey, number>
  }, [recommendedJobs, externalJobs.length, lastSearchLabel, stats.data])

  const newToday = agents.reduce((sum, agent) => sum + (agent.active ? agent.new_jobs_count : 0), 0)
  const activeAgentsCount = agents.filter((agent) => agent.active).length

  return (
    <div className="space-y-6" dir={dir}>
      <HeroSection
        onCreateAgent={() => setModalOpen(true)}
        onBrowse={() => document.getElementById('job-list-section')?.scrollIntoView({ behavior: 'smooth' })}
      />
      <SmartSearchBar
        value={searchInput}
        onChange={setSearchInput}
        onSubmit={handleSearch}
        loading={searchLoading}
      />

      {searchError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {searchError}
        </div>
      )}

      {agentsQuery.isError && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {t('jobs.error.loadAgentsFailed')}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={Zap}
          label={t('jobs.stats.newToday')}
          value={newToday || recommendedJobs.length || 0}
          trend={activeAgentsCount > 0 ? t('jobs.stats.activeAgents', { count: activeAgentsCount }) : undefined}
          tone="teal"
        />
        <StatCard
          icon={TrendingUp}
          label={t('jobs.stats.highMatch')}
          value={recommendedJobs.filter((job) => (job.match_score ?? 0) >= 70).length}
          tone="emerald"
        />
        <StatCard
          icon={CheckCircle2}
          label={t('jobs.stats.applied')}
          value={stats.data?.data?.applications_count ?? 0}
          tone="violet"
        />
        <StatCard
          icon={Building2}
          label={t('jobs.stats.savedAgents')}
          value={agents.length}
          tone="amber"
        />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-[#0F172A]">
              {t('jobs.agents.title')}
            </h2>
            <p className="mt-0.5 text-xs text-[#64748B]">
              {t('jobs.agents.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {profileSummary.data?.data?.ready && (
              <span className="rounded-full bg-[#E3EFEE] px-3 py-1 text-[11px] font-medium text-[#0F5C5C] ring-1 ring-[#0F5C5C]/15">
                {t('jobs.agents.profileReady')}
              </span>
            )}
            <Button onClick={() => setModalOpen(true)} variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />}>
              {t('jobs.agents.new')}
            </Button>
          </div>
        </div>

        {agentsQuery.isLoading ? (
          <Card className="flex min-h-[170px] items-center justify-center border border-dashed border-[#CBD5E1]">
            <div className="text-center">
              <Spinner size="lg" className="text-[#0F5C5C]" />
              <p className="mt-3 text-sm text-[#64748B]">{t('jobs.agents.loading')}</p>
            </div>
          </Card>
        ) : (
          <motion.div
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.07 } } }}
          >
            {agents.map((agent) => (
              <motion.div
                key={agent.id}
                variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              >
              <AgentCard
                agent={agent}
                onToggle={() =>
                  updateAgent.mutate({
                    id: agent.id,
                    payload: { active: !agent.active },
                  })
                }
                onEdit={() => {
                  setEditingAgent(agent)
                  setModalOpen(true)
                }}
                onDelete={() => deleteAgent.mutate(agent.id)}
                onView={() => {
                  void handleOpenAgent(agent)
                }}
              />
              </motion.div>
            ))}
            <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: 0.35, ease: 'easeOut' }}>
              <NewAgentCard onClick={() => setModalOpen(true)} />
            </motion.div>
          </motion.div>
        )}
      </div>

      <div id="job-list-section" className="flex flex-wrap items-center gap-1 rounded-2xl border border-[#E2E8F0] bg-white p-1 shadow-sm">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition',
                active
                  ? 'bg-[#0F5C5C] text-white shadow-sm'
                  : 'text-[#64748B] hover:bg-[var(--rushd-surface-alt)] hover:text-[#0F172A]',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(tab.labelKey)}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[9px]',
                  active ? 'bg-white/20 text-white' : 'bg-[var(--rushd-surface-alt)] text-[var(--rushd-ink-soft)]',
                )}
              >
                {tabCounts[tab.key]}
              </span>
            </button>
          )
        })}
        <div className="ms-auto flex items-center gap-1">
          <Button variant="secondary" size="sm" icon={<Settings className="h-3.5 w-3.5" />} aria-label={t('jobs.settings')} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr,1fr]">
        <div className="space-y-3">
          {lastSearchLabel && activeTab === 'all' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#0F5C5C]/20 bg-[#E3EFEE]/60 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#0F5C5C]">{t('jobs.searchResults')}</p>
                  <p className="mt-0.5 truncate text-sm font-bold text-[#0F172A]">
                    {lastSearchLabel}
                    {!searchLoading && (
                      <span className="mx-2 text-xs font-medium text-[#64748B]">
                        {t('jobs.resultsCount', { count: visibleJobs.length })}
                      </span>
                    )}
                  </p>
                </div>
                <Button onClick={clearSearch} variant="secondary" size="sm" icon={<X className="h-3 w-3" />} className="shrink-0">
                  {t('jobs.clearSearch')}
                </Button>
              </div>

              {(() => {
                const sourceCounts: Record<string, number> = {}
                for (const job of externalJobs) {
                  if (job.source) sourceCounts[job.source] = (sourceCounts[job.source] || 0) + 1
                }
                const sources = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])
                if (sources.length <= 1) return null
                return (
                  <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3 py-2">
                    <span className="text-[10px] font-semibold text-[#64748B]">{t('jobs.sources')}</span>
                    {sources.map(([src, count]) => {
                      const active = sourceFilter.size === 0 || sourceFilter.has(src)
                      return (
                        <button
                          key={src}
                          onClick={() => {
                            setSourceFilter((prev) => {
                              const next = new Set(prev)
                              if (next.size === 0) {
                                // First click: select only this source
                                return new Set([src])
                              }
                              if (next.has(src)) {
                                next.delete(src)
                                // If nothing left, clear filter (show all)
                                return next.size === 0 ? new Set() : next
                              }
                              next.add(src)
                              // If all sources selected, clear filter
                              return next.size === sources.length ? new Set() : next
                            })
                          }}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold transition',
                            active
                              ? 'bg-[#0F5C5C]/10 text-[#0F5C5C] ring-1 ring-[#0F5C5C]/30'
                              : 'bg-[var(--rushd-surface-alt)] text-[var(--rushd-ink-soft)]',
                          )}
                        >
                          {SOURCE_LABELS[src] ?? src}
                          <span className={cn(
                            'rounded-full px-1 text-[9px]',
                            active ? 'bg-[#0F5C5C]/20' : 'bg-[#E2E8F0]',
                          )}>
                            {count}
                          </span>
                        </button>
                      )
                    })}
                    {sourceFilter.size > 0 && (
                      <button
                        onClick={() => setSourceFilter(new Set())}
                        className="mx-1 text-[10px] font-medium text-[#64748B] underline hover:text-[#0F5C5C]"
                      >
                        {t('jobs.sourcesAll')}
                      </button>
                    )}
                  </div>
                )
              })()}
            </div>
          )}

          {searchLoading ? (
            <Card className="flex min-h-[300px] flex-col items-center justify-center border border-dashed border-[#CBD5E1]">
              <Spinner size="lg" className="text-[#0F5C5C]" />
              <p className="mt-3 text-sm text-[#64748B]">{t('jobs.searchingExternal')}</p>
            </Card>
          ) : recommended.isLoading && !lastSearchLabel ? (
            <Card className="flex min-h-[300px] flex-col items-center justify-center border border-dashed border-[#CBD5E1]">
              <Spinner size="lg" className="text-[#0F5C5C]" />
              <p className="mt-3 text-sm text-[#64748B]">{t('jobs.loadingRecommendations')}</p>
            </Card>
          ) : visibleJobs.length === 0 ? (
            <Card className="flex min-h-[300px] flex-col items-center justify-center border border-dashed border-[#CBD5E1] text-center">
              <Search className="h-10 w-10 text-[#CBD5E1]" />
              {lastSearchLabel ? (
                <>
                  <p className="mt-3 text-sm font-medium text-[#0F172A]">{t('jobs.noResultsFor', { query: lastSearchLabel })}</p>
                  <p className="mt-1 text-xs text-[#64748B]">{t('jobs.noResultsHint')}</p>
                  <Button onClick={clearSearch} variant="secondary" size="sm" icon={<X className="h-3.5 w-3.5" />} className="mt-4">
                    {t('jobs.clearAndReturn')}
                  </Button>
                </>
              ) : (
                <>
                  <p className="mt-3 text-sm font-medium text-[#0F172A]">{t('jobs.noJobsYet')}</p>
                  <p className="mt-1 text-xs text-[#64748B]">{t('jobs.noJobsHint')}</p>
                  <Button onClick={() => setModalOpen(true)} size="sm" icon={<Plus className="h-3.5 w-3.5" />} className="mt-4">
                    {t('jobs.hero.createAgent')}
                  </Button>
                </>
              )}
            </Card>
          ) : (
            <motion.div
              className="contents"
              key={lastSearchLabel ?? 'default'}
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
            >
              {visibleJobs.map((job) => (
                <motion.div
                  key={job.id}
                  variants={{ hidden: { opacity: 0, x: -16 }, visible: { opacity: 1, x: 0 } }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  exit={{ opacity: 0, x: -16 }}
                >
                  <JobListItem
                    job={job}
                    selected={selectedJob?.id === job.id}
                    onSelect={() => setSelectedJobId(job.id)}
                    onSave={() => saveJob.mutate(job.id)}
                    onHide={() => {
                      setHidden((current) => new Set(current).add(job.id))
                      if (selectedJob?.id === job.id) setSelectedJobId(null)
                    }}
                    onApply={() => createApplication.mutate({ jobId: job.id, status: 'applied' })}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>

        <div>
          <JobDetailsPanel
            job={selectedJob}
            onApply={() => {
              if (selectedJob) {
                createApplication.mutate({ jobId: selectedJob.id, status: 'applied' })
              }
            }}
            onSave={() => selectedJob && saveJob.mutate(selectedJob.id)}
          />
        </div>
      </div>

      <SearchAgentBuilderModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setEditingAgent(null)
        }}
        onCreate={handleCreateAgent}
        creating={editingAgent ? updateAgent.isPending : createAgent.isPending}
        prefill={{ title: searchInput.split('•')[0]?.trim() }}
        profile={profileSummary.data?.data ?? null}
        editAgent={editingAgent}
      />
    </div>
  )
}
