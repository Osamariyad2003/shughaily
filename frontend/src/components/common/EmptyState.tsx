import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'
import Button from '@/components/ui/Button'

interface EmptyStateProps {
  icon?: ReactNode
  message: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

export default function EmptyState({
  icon,
  message,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-[var(--rushd-surface-alt)] flex items-center justify-center mb-4 text-[var(--rushd-ink-soft)]">
        {icon || <Inbox className="w-8 h-8" />}
      </div>
      <h3 className="text-lg font-bold text-[#0F172A] mb-1">{message}</h3>
      {description && <p className="text-sm text-[#64748B] mb-4 max-w-md">{description}</p>}
      {actionLabel && onAction && (
        <Button onClick={onAction} variant="primary" size="md">
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
