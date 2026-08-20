import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Icon rendered before the label (before = leading edge, RTL-aware via flow). */
  icon?: ReactNode
  /** Icon rendered after the label. */
  iconEnd?: ReactNode
}

/**
 * Rushd Button — five variants, three sizes, visible keyboard focus ring,
 * and distinct hover/active states. See tokens.css / rushd.css for the
 * underlying design tokens.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, iconEnd, disabled, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={props.type ?? 'button'}
      className={cn(
        'rushd-btn',
        `rushd-btn--${variant}`,
        `rushd-btn--${size}`,
        !children && 'rushd-btn--icon-only',
        className,
      )}
      disabled={disabled}
      {...props}
    >
      {icon && (
        <span className="rushd-btn__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
      {iconEnd && (
        <span className="rushd-btn__icon" aria-hidden="true">
          {iconEnd}
        </span>
      )}
    </button>
  )
})

export default Button
