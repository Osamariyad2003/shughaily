import { cn } from '@/lib/utils'
import type { Status } from '@/lib/types'

export interface StatusBadgeProps {
  status: Status
  className?: string
}

const STATUS_CONFIG: Record<Status, { label: string }> = {
  new: { label: 'جديدة' },
  applied: { label: 'تم التقديم' },
  interview: { label: 'مقابلة' },
  offer: { label: 'عرض' },
  rejected: { label: 'مرفوض' },
}

/** Rushd StatusBadge — Arabic-labeled pill with a colored dot per pipeline stage. */
export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status]

  return (
    <span className={cn('rushd-status-badge', `rushd-status-badge--${status}`, className)}>
      <span className="rushd-status-badge__dot" aria-hidden="true" />
      {config.label}
    </span>
  )
}
