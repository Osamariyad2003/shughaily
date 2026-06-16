import { Search, MapPin, Briefcase } from 'lucide-react'
import { WORK_TYPES } from '@/lib/constants'
import { useUIStore } from '@/store/uiStore'

export default function JobFilters() {
  const { jobFilters, setJobFilters } = useUIStore()

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[240px] relative">
        <Search className="absolute top-1/2 -translate-y-1/2 right-3 w-4 h-4 text-[#64748B] pointer-events-none" />
        <input
          type="text"
          value={jobFilters.search}
          onChange={(e) => setJobFilters({ search: e.target.value })}
          placeholder="ابحث عن وظيفة..."
          className="w-full pr-10 pl-3 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-[#0EA5A4] transition-colors"
        />
      </div>

      <div className="relative">
        <Briefcase className="absolute top-1/2 -translate-y-1/2 right-3 w-4 h-4 text-[#64748B] pointer-events-none" />
        <select
          value={jobFilters.workType}
          onChange={(e) => setJobFilters({ workType: e.target.value })}
          className="pr-10 pl-8 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-[#0EA5A4] transition-colors appearance-none cursor-pointer"
        >
          <option value="">نوع العمل: الكل</option>
          {WORK_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="relative min-w-[180px]">
        <MapPin className="absolute top-1/2 -translate-y-1/2 right-3 w-4 h-4 text-[#64748B] pointer-events-none" />
        <input
          type="text"
          value={jobFilters.location}
          onChange={(e) => setJobFilters({ location: e.target.value })}
          placeholder="الموقع..."
          className="w-full pr-10 pl-3 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-[#0EA5A4] transition-colors"
        />
      </div>
    </div>
  )
}
