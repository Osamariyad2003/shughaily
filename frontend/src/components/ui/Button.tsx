import { type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/utils'
import Spinner from './Spinner'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
  loading?: boolean
}

const variantStyles = {
  primary:
    'bg-[#0EA5A4] text-white hover:bg-[#0F766E] focus:ring-[#0EA5A4]/30',
  secondary:
    'border border-[#0EA5A4] text-[#0EA5A4] hover:bg-[#CCFBF1] focus:ring-[#0EA5A4]/20',
  ghost:
    'text-[#64748B] hover:bg-[#F8FAFC] focus:ring-slate-200',
}

const sizeStyles = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-6 py-3 text-base gap-2.5',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  children,
  className,
  disabled,
  loading,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  )
}
