import { type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  /** Lifts + shadows the card on hover. */
  hoverLift?: boolean
}

/** Rushd Card — consistent border/shadow/radius wrapper, with an optional hover-lift. */
export default function Card({ children, className, hoverLift, onClick, onKeyDown, ...props }: CardProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e)
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      ;(e.currentTarget as HTMLDivElement).click()
    }
  }

  return (
    <div
      className={cn('rushd-card', hoverLift && 'rushd-card--hover-lift', onClick && 'rushd-card--clickable', className)}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? handleKeyDown : onKeyDown}
      {...props}
    >
      {children}
    </div>
  )
}
