import { type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'neutral'
  children: ReactNode
  className?: string
}

const variantStyles = {
  default: 'bg-[#CCFBF1] text-[#0F766E]',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
  neutral: 'bg-[var(--rushd-surface-alt)] text-[var(--rushd-ink-soft)]',
}

export default function Badge({
  variant = 'default',
  children,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}
