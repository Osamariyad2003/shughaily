import { Search, MapPin, Briefcase } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { useTranslation } from '@/store/i18nStore'
import type { TranslationKey } from '@/lib/locales'

const WORK_TYPE_OPTIONS: { value: string; labelKey: TranslationKey }[] = [
  { value: 'full_time', labelKey: 'settings.preferences.workType.fullTime' },
  { value: 'part_time', labelKey: 'settings.preferences.workType.partTime' },
  { value: 'remote', labelKey: 'settings.preferences.workType.remote' },
  { value: 'contract', labelKey: 'settings.preferences.workType.contract' },
  { value: 'freelance', labelKey: 'settings.preferences.workType.freelance' },
]

export default function JobFilters() {
  const { jobFilters, setJobFilters } = useUIStore()
  const { t } = useTranslation()

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[240px] relative">
        <Search className="absolute top-1/2 -translate-y-1/2 end-3 w-4 h-4 text-[#64748B] pointer-events-none" />
        <input
          type="text"
          value={jobFilters.search}
          onChange={(e) => setJobFilters({ search: e.target.value })}
          placeholder={t('jobFilters.search.placeholder')}
          className="w-full pe-10 ps-3 py-2.5 bg-[var(--rushd-surface-alt)] border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-[#0EA5A4] transition-colors"
        />
      </div>

      <div className="relative">
        <Briefcase className="absolute top-1/2 -translate-y-1/2 end-3 w-4 h-4 text-[#64748B] pointer-events-none" />
        <select
          value={jobFilters.workType}
          onChange={(e) => setJobFilters({ workType: e.target.value })}
          className="pe-10 ps-8 py-2.5 bg-[var(--rushd-surface-alt)] border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-[#0EA5A4] transition-colors appearance-none cursor-pointer"
        >
          <option value="">{t('jobFilters.workType.all')}</option>
          {WORK_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {t(opt.labelKey)}
            </option>
          ))}
        </select>
      </div>

      <div className="relative min-w-[180px]">
        <MapPin className="absolute top-1/2 -translate-y-1/2 end-3 w-4 h-4 text-[#64748B] pointer-events-none" />
        <input
          type="text"
          value={jobFilters.location}
          onChange={(e) => setJobFilters({ location: e.target.value })}
          placeholder={t('jobFilters.location.placeholder')}
          className="w-full pe-10 ps-3 py-2.5 bg-[var(--rushd-surface-alt)] border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-[#0EA5A4] transition-colors"
        />
      </div>
    </div>
  )
}
