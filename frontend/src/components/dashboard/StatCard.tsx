import type { ReactNode } from 'react'
import Card from '@/components/ui/Card'

interface StatCardProps {
  icon: ReactNode
  label: string
  value: string | number
  trend?: { value: number; direction: 'up' | 'down' }
}

export default function StatCard({ icon, label, value, trend }: StatCardProps) {
  return (
    <Card>
      <div className="flex items-start justify-between mb-3">
        <div className="p-2.5 bg-[#CCFBF1] rounded-lg text-[#0EA5A4]">{icon}</div>
        {trend && (
          <span
            className={`text-xs font-bold ${
              trend.direction === 'up' ? 'text-[#22C55E]' : 'text-[#EF4444]'
            }`}
          >
            {trend.direction === 'up' ? '+' : '−'}
            {trend.value}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-[#0F172A] mb-1">{value}</p>
      <p className="text-sm text-[#64748B]">{label}</p>
    </Card>
  )
}
