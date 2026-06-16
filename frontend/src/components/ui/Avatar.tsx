import { cn } from '../../lib/utils'

interface AvatarProps {
  name: string
  src?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeStyles = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return parts[0][0] + parts[1][0]
  }
  return parts[0]?.slice(0, 2) || '؟'
}

export default function Avatar({
  name,
  src,
  size = 'md',
  className,
}: AvatarProps) {
  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-full overflow-hidden bg-[#CCFBF1] text-[#0F766E] font-semibold',
        sizeStyles[size],
        className,
      )}
      title={name}
    >
      {src ? (
        <img
          src={src}
          alt={name}
          className="h-full w-full object-cover"
        />
      ) : (
        <span>{getInitials(name)}</span>
      )}
    </div>
  )
}
