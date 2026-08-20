import { useEffect, useMemo, useState } from 'react'
import { Briefcase, CheckCircle2, MapPin, Search, Target, X } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/store/i18nStore'
import type { TranslationKey } from '@/lib/locales'
import type {
  CandidateProfileSummary,
  SearchAgent,
  SearchAgentCompanySize,
  SearchAgentInput,
  SearchAgentSeniority,
  SearchAgentWorkMode,
} from '@/lib/types'

const SENIORITY_OPTIONS: Array<{ value: SearchAgentSeniority; labelKey: TranslationKey }> = [
  { value: 'intern', labelKey: 'searchAgent.seniority.intern' },
  { value: 'junior', labelKey: 'searchAgent.seniority.junior' },
  { value: 'mid', labelKey: 'searchAgent.seniority.mid' },
  { value: 'senior', labelKey: 'searchAgent.seniority.senior' },
  { value: 'lead', labelKey: 'searchAgent.seniority.lead' },
  { value: 'manager', labelKey: 'searchAgent.seniority.manager' },
]

const WORK_MODE_OPTIONS: Array<{ value: SearchAgentWorkMode; labelKey: TranslationKey }> = [
  { value: 'onsite', labelKey: 'searchAgent.workMode.onsite' },
  { value: 'hybrid', labelKey: 'searchAgent.workMode.hybrid' },
  { value: 'remote', labelKey: 'searchAgent.workMode.remote' },
]

const COMPANY_SIZE_OPTIONS: Array<{ value: SearchAgentCompanySize; labelKey: TranslationKey }> = [
  { value: 'startup', labelKey: 'searchAgent.companySize.startup' },
  { value: 'small', labelKey: 'searchAgent.companySize.small' },
  { value: 'mid_market', labelKey: 'searchAgent.companySize.midMarket' },
  { value: 'enterprise', labelKey: 'searchAgent.companySize.enterprise' },
]

const MAX_AGE_DAYS_OPTIONS: Array<{ value: number; labelKey: TranslationKey }> = [
  { value: 1, labelKey: 'searchAgent.maxAge.24h' },
  { value: 7, labelKey: 'searchAgent.maxAge.7d' },
  { value: 30, labelKey: 'searchAgent.maxAge.30d' },
]

const SOURCE_OPTIONS = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'google_jobs', label: 'Google Jobs' },
  { value: 'remotive', label: 'Remotive' },
  { value: 'remoteok', label: 'RemoteOK' },
  { value: 'arbeitnow', label: 'Arbeitnow' },
  { value: 'themuse', label: 'The Muse' },
] as const

function splitComma(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function buildDefaultDraft(
  prefill: { title?: string; location?: string } | undefined,
  profile: CandidateProfileSummary | null | undefined,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
): SearchAgentInput {
  const roleSeed = prefill?.title?.trim() || profile?.preferred_roles?.[0] || ''
  const locationSeed = prefill?.location?.trim()

  return {
    name: roleSeed ? t('searchAgent.defaultAgentName', { role: roleSeed }) : t('searchAgent.defaultAgentName.generic'),
    target_titles: roleSeed ? [roleSeed] : profile?.preferred_roles?.slice(0, 2) ?? [],
    seniority: profile?.inferred_seniority ? [profile.inferred_seniority] : [],
    preferred_locations: locationSeed ? [locationSeed] : profile?.preferred_locations ?? [],
    work_modes: [],
    industries: [],
    company_sizes: [],
    max_age_days: 30,
    include_keywords: profile?.skills?.slice(0, 5) ?? [],
    exclude_keywords: [],
    blacklist_companies: [],
    source_preferences: SOURCE_OPTIONS.map((option) => option.value),
  }
}

function ToggleChipGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>
  value: T[]
  onChange: (next: T[]) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = value.includes(option.value)
        return (
          <button
            key={option.value}
            type="button"
            onClick={() =>
              onChange(
                selected ? value.filter((item) => item !== option.value) : [...value, option.value],
              )
            }
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition',
              selected
                ? 'border-[#0EA5A4] bg-teal-50 text-[#0F766E]'
                : 'border-[#E2E8F0] bg-white text-[#475569] hover:border-[#0EA5A4]',
            )}
          >
            {selected && <CheckCircle2 className="h-3.5 w-3.5" />}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export default function SearchAgentBuilderModal({
  open,
  onClose,
  onCreate,
  creating,
  prefill,
  profile,
  editAgent,
}: {
  open: boolean
  onClose: () => void
  onCreate: (payload: SearchAgentInput) => Promise<void> | void
  creating?: boolean
  prefill?: { title?: string; location?: string }
  profile?: CandidateProfileSummary | null
  editAgent?: SearchAgent | null
}) {
  const { t, dir } = useTranslation()
  const isEdit = !!editAgent

  const seniorityOptions = useMemo(() => SENIORITY_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) })), [t])
  const workModeOptions = useMemo(() => WORK_MODE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) })), [t])
  const companySizeOptions = useMemo(() => COMPANY_SIZE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) })), [t])

  const defaults = useMemo(() => {
    if (editAgent) {
      return {
        name: editAgent.name,
        target_titles: editAgent.target_titles,
        seniority: editAgent.seniority,
        preferred_locations: editAgent.preferred_locations,
        work_modes: editAgent.work_modes,
        industries: editAgent.industries,
        company_sizes: editAgent.company_sizes,
        max_age_days: editAgent.max_age_days ?? 30,
        include_keywords: editAgent.include_keywords,
        exclude_keywords: editAgent.exclude_keywords,
        blacklist_companies: editAgent.blacklist_companies,
        source_preferences: editAgent.source_preferences,
      } satisfies SearchAgentInput
    }
    return buildDefaultDraft(prefill, profile, t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editAgent, prefill, profile])

  const [name, setName] = useState(defaults.name)
  const [targetTitles, setTargetTitles] = useState(defaults.target_titles.join(', '))
  const [seniority, setSeniority] = useState<SearchAgentSeniority[]>(defaults.seniority)
  const [locations, setLocations] = useState(defaults.preferred_locations.join(', '))
  const [workModes, setWorkModes] = useState<SearchAgentWorkMode[]>(defaults.work_modes)
  const [industries, setIndustries] = useState(defaults.industries.join(', '))
  const [companySizes, setCompanySizes] = useState<SearchAgentCompanySize[]>(defaults.company_sizes)
  const [maxAgeDays, setMaxAgeDays] = useState<number>(defaults.max_age_days)
  const [includeKeywords, setIncludeKeywords] = useState(defaults.include_keywords.join(', '))
  const [excludeKeywords, setExcludeKeywords] = useState(defaults.exclude_keywords.join(', '))
  const [blacklistCompanies, setBlacklistCompanies] = useState(defaults.blacklist_companies.join(', '))
  const [sources, setSources] = useState<string[]>(defaults.source_preferences)

  useEffect(() => {
    if (!open) return

    const nextDefaults = editAgent
      ? {
          name: editAgent.name,
          target_titles: editAgent.target_titles,
          seniority: editAgent.seniority,
          preferred_locations: editAgent.preferred_locations,
          work_modes: editAgent.work_modes,
          industries: editAgent.industries,
          company_sizes: editAgent.company_sizes,
          max_age_days: editAgent.max_age_days ?? 30,
          include_keywords: editAgent.include_keywords,
          exclude_keywords: editAgent.exclude_keywords,
          blacklist_companies: editAgent.blacklist_companies,
          source_preferences: editAgent.source_preferences,
        }
      : buildDefaultDraft(prefill, profile, t)
    setName(nextDefaults.name)
    setTargetTitles(nextDefaults.target_titles.join(', '))
    setSeniority(nextDefaults.seniority)
    setLocations(nextDefaults.preferred_locations.join(', '))
    setWorkModes(nextDefaults.work_modes)
    setIndustries(nextDefaults.industries.join(', '))
    setCompanySizes(nextDefaults.company_sizes)
    setMaxAgeDays(nextDefaults.max_age_days)
    setIncludeKeywords(nextDefaults.include_keywords.join(', '))
    setExcludeKeywords(nextDefaults.exclude_keywords.join(', '))
    setBlacklistCompanies(nextDefaults.blacklist_companies.join(', '))
    setSources(nextDefaults.source_preferences)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill, profile, editAgent])

  if (!open) return null

  const handleSubmit = async () => {
    const payload: SearchAgentInput = {
      name: name.trim(),
      target_titles: splitComma(targetTitles),
      seniority,
      preferred_locations: splitComma(locations),
      work_modes: workModes,
      industries: splitComma(industries),
      company_sizes: companySizes,
      max_age_days: maxAgeDays,
      include_keywords: splitComma(includeKeywords),
      exclude_keywords: splitComma(excludeKeywords),
      blacklist_companies: splitComma(blacklistCompanies),
      source_preferences: sources,
    }

    await onCreate(payload)
    onClose()
  }

  const canSubmit = name.trim().length >= 2 && splitComma(targetTitles).length > 0 && sources.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" dir={dir}>
      <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#F1F5F9] bg-gradient-to-bl from-teal-50 to-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0EA5A4] text-white">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#0F172A]">{isEdit ? t('searchAgent.title.edit') : t('searchAgent.title.create')}</h2>
              <p className="text-xs text-[#64748B]">
                {isEdit ? t('searchAgent.subtitle.edit') : t('searchAgent.subtitle.create')}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-[#94A3B8] hover:bg-[var(--rushd-surface-alt)] hover:text-[#0F172A]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid max-h-[calc(92vh-140px)] gap-0 overflow-y-auto lg:grid-cols-[1.2fr,0.8fr]">
          <div className="space-y-5 p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#0F172A]">{t('searchAgent.name.label')}</label>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('searchAgent.name.placeholder')}
                  className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#0EA5A4] focus:ring-2 focus:ring-[#0EA5A4]/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#0F172A]">{t('searchAgent.targetTitles.label')}</label>
                <input
                  value={targetTitles}
                  onChange={(e) => setTargetTitles(e.target.value)}
                  placeholder="Senior Backend Engineer, Platform Engineer"
                  className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#0EA5A4] focus:ring-2 focus:ring-[#0EA5A4]/20"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-[#0F172A]">{t('searchAgent.seniority.label')}</label>
              <ToggleChipGroup options={seniorityOptions} value={seniority} onChange={setSeniority} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#0F172A]">{t('searchAgent.locations.label')}</label>
                <input
                  value={locations}
                  onChange={(e) => setLocations(e.target.value)}
                  placeholder={t('searchAgent.locations.placeholder')}
                  className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#0EA5A4] focus:ring-2 focus:ring-[#0EA5A4]/20"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold text-[#0F172A]">{t('searchAgent.workMode.label')}</label>
                <ToggleChipGroup options={workModeOptions} value={workModes} onChange={setWorkModes} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#0F172A]">{t('searchAgent.industries.label')}</label>
                <input
                  value={industries}
                  onChange={(e) => setIndustries(e.target.value)}
                  placeholder="Fintech, SaaS, Healthtech"
                  className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#0EA5A4] focus:ring-2 focus:ring-[#0EA5A4]/20"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold text-[#0F172A]">{t('searchAgent.companySize.label')}</label>
                <ToggleChipGroup options={companySizeOptions} value={companySizes} onChange={setCompanySizes} />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-[#0F172A]">{t('searchAgent.postedDate.label')}</label>
              <div className="flex flex-wrap gap-2">
                {MAX_AGE_DAYS_OPTIONS.map((option) => {
                  const selected = maxAgeDays === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setMaxAgeDays(option.value)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition',
                        selected
                          ? 'border-[#0EA5A4] bg-teal-50 text-[#0F766E]'
                          : 'border-[#E2E8F0] bg-white text-[#475569] hover:border-[#0EA5A4]',
                      )}
                    >
                      {selected && <CheckCircle2 className="h-3.5 w-3.5" />}
                      {t(option.labelKey)}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#0F172A]">{t('searchAgent.includeKeywords.label')}</label>
                <input
                  value={includeKeywords}
                  onChange={(e) => setIncludeKeywords(e.target.value)}
                  placeholder="Node.js, AWS, PostgreSQL"
                  className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#0EA5A4] focus:ring-2 focus:ring-[#0EA5A4]/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#0F172A]">{t('searchAgent.excludeKeywords.label')}</label>
                <input
                  value={excludeKeywords}
                  onChange={(e) => setExcludeKeywords(e.target.value)}
                  placeholder={t('searchAgent.excludeKeywords.placeholder')}
                  className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#0EA5A4] focus:ring-2 focus:ring-[#0EA5A4]/20"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#0F172A]">{t('searchAgent.blacklistCompanies.label')}</label>
              <input
                value={blacklistCompanies}
                onChange={(e) => setBlacklistCompanies(e.target.value)}
                placeholder={t('searchAgent.blacklistCompanies.placeholder')}
                className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#0EA5A4] focus:ring-2 focus:ring-[#0EA5A4]/20"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-[#0F172A]">{t('searchAgent.sources.label')}</label>
              <div className="flex flex-wrap gap-2">
                {SOURCE_OPTIONS.map((option) => {
                  const selected = sources.includes(option.value)
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setSources((current) =>
                          selected
                            ? current.filter((item) => item !== option.value)
                            : [...current, option.value],
                        )
                      }
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition',
                        selected
                          ? 'border-[#0EA5A4] bg-teal-50 text-[#0F766E]'
                          : 'border-[#E2E8F0] bg-white text-[#475569] hover:border-[#0EA5A4]',
                      )}
                    >
                      {selected && <CheckCircle2 className="h-3.5 w-3.5" />}
                      {option.label}
                    </button>
                  )
                })}
              </div>
              {sources.length === 0 && (
                <p className="mt-2 text-xs font-medium text-rose-600">
                  {t('searchAgent.sources.errorNone')}
                </p>
              )}
            </div>
          </div>

          <div className="border-s border-[#F1F5F9] bg-[var(--rushd-surface-alt)] p-5">
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-[#0F172A]">
                {t('searchAgent.profileSummary.title')}
              </p>

              {!profile || profile.needs_resume ? (
                <div className="mt-4 rounded-2xl border border-dashed border-[#CBD5E1] bg-[var(--rushd-surface-alt)] p-4 text-sm text-[var(--rushd-ink-soft)]">
                  {t('searchAgent.profileSummary.needsResume')}
                </div>
              ) : profile.needs_parsing ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                  {t('searchAgent.profileSummary.needsParsing')}
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="rounded-2xl bg-gradient-to-bl from-teal-50 to-white p-4 ring-1 ring-teal-100">
                    <p className="text-xs font-semibold text-[#0F766E]">{t('searchAgent.profileSummary.summary')}</p>
                    <p className="mt-2 text-xs leading-6 text-[#334155]">
                      {profile.summary || t('searchAgent.profileSummary.summaryFallback')}
                    </p>
                  </div>

                  <div>
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#0F172A]">
                      <Briefcase className="h-3.5 w-3.5 text-[#0EA5A4]" />
                      {t('searchAgent.profileSummary.roles')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {profile.preferred_roles.length > 0 ? (
                        profile.preferred_roles.slice(0, 6).map((role) => (
                          <Badge key={role} variant="neutral">{role}</Badge>
                        ))
                      ) : (
                        <span className="text-xs text-[#64748B]">{t('searchAgent.profileSummary.rolesEmpty')}</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#0F172A]">
                      <Target className="h-3.5 w-3.5 text-emerald-600" />
                      {t('searchAgent.profileSummary.skills')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {profile.skills.length > 0 ? (
                        profile.skills.slice(0, 10).map((skill) => (
                          <Badge key={skill}>{skill}</Badge>
                        ))
                      ) : (
                        <span className="text-xs text-[#64748B]">{t('searchAgent.profileSummary.skillsEmpty')}</span>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-3">
                      <p className="text-[11px] font-medium text-[#64748B]">{t('searchAgent.profileSummary.suggestedLevel')}</p>
                      <p className="mt-1 text-sm font-bold text-[#0F172A]">
                        {profile.inferred_seniority || t('searchAgent.profileSummary.unspecified')}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-3">
                      <p className="flex items-center gap-1 text-[11px] font-medium text-[#64748B]">
                        <MapPin className="h-3 w-3" />
                        {t('searchAgent.profileSummary.locations')}
                      </p>
                      <p className="mt-1 text-sm font-bold text-[#0F172A]">
                        {profile.preferred_locations.join(t('common.listSeparator')) || t('searchAgent.profileSummary.unspecified')}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[#F1F5F9] bg-[var(--rushd-surface-alt)] p-4">
          <p className="text-xs text-[var(--rushd-ink-soft)]">
            {t('searchAgent.footer.note')}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>{t('searchAgent.cancel')}</Button>
            <Button onClick={handleSubmit} loading={creating} disabled={!canSubmit}>
              {isEdit ? t('searchAgent.save.edit') : t('searchAgent.save.create')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
