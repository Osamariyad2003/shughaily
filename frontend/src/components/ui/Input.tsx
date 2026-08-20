import { type InputHTMLAttributes, type ReactNode, useId } from 'react'
import { cn } from '../../lib/utils'
import { useTranslation } from '@/store/i18nStore'

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
  const { dir } = useTranslation()

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-start text-sm font-medium text-[#0F172A]"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[#64748B]">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          className={cn(
            'w-full rounded-lg border bg-[var(--rushd-surface-alt)] px-3 py-2 text-sm text-[#0F172A] placeholder:text-[#64748B]/60 transition-colors focus:outline-none focus:ring-2 focus:ring-[#0EA5A4]/30 focus:border-[#0EA5A4] disabled:cursor-not-allowed disabled:opacity-50',
            icon ? 'pe-10' : '',
            error
              ? 'border-[#EF4444] focus:ring-[#EF4444]/20 focus:border-[#EF4444]'
              : 'border-[#E2E8F0]',
            className,
          )}
          dir={dir}
          {...props}
        />
      </div>
      {error && (
        <p className="mt-1 text-start text-xs text-[#EF4444]">{error}</p>
      )}
    </div>
  )
}
