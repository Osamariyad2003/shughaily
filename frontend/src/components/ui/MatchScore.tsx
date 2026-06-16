import { cn } from '../../lib/utils'

interface MatchScoreProps {
  score: number
  className?: string
  showLabel?: boolean
}

function getScoreColor(score: number) {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-[#0EA5A4]'
  if (score >= 40) return 'text-amber-500'
  return 'text-red-500'
}

function getBarBg(score: number) {
  if (score >= 80) return 'bg-green-500'
  if (score >= 60) return 'bg-[#0EA5A4]'
  if (score >= 40) return 'bg-amber-500'
  return 'bg-red-500'
}

export default function MatchScore({
  score,
  className,
  showLabel = true,
}: MatchScoreProps) {
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)))

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {/* Progress bar */}
      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-700 ease-out',
            getBarBg(clampedScore),
          )}
          style={{ width: `${clampedScore}%` }}
        />
      </div>

      {/* Percentage label */}
      {showLabel && (
        <span
          className={cn(
            'text-sm font-bold tabular-nums min-w-[3ch] text-left',
            getScoreColor(clampedScore),
          )}
        >
          {clampedScore}%
        </span>
      )}
    </div>
  )
}
