import { type InputHTMLAttributes, type ReactNode, useId } from 'react'
import { cn } from '../../lib/utils'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  error?: string
  icon?: ReactNode
}

export default function Input({
  label,
  error,
  icon,
  className,
  id,
  ...props
}: InputProps) {
  const generatedId = useId()
  const inputId = id || generatedId

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-sm font-medium text-[#0F172A] text-right"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B]">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          className={cn(
            'w-full rounded-lg border bg-white px-3 py-2 text-sm text-[#0F172A] placeholder:text-[#64748B]/60 transition-colors focus:outline-none focus:ring-2 focus:ring-[#0EA5A4]/30 focus:border-[#0EA5A4] disabled:cursor-not-allowed disabled:opacity-50',
            icon ? 'pr-10' : '',
            error
              ? 'border-[#EF4444] focus:ring-[#EF4444]/20 focus:border-[#EF4444]'
              : 'border-[#E2E8F0]',
            className,
          )}
          dir="rtl"
          {...props}
        />
      </div>
      {error && (
        <p className="mt-1 text-xs text-[#EF4444] text-right">{error}</p>
      )}
    </div>
  )
}
