import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  ReactNode,
} from 'react'

type SurfaceTone = 'default' | 'strong' | 'soft'
type SurfacePadding = 'none' | 'sm' | 'md' | 'lg'

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

interface LiquidSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  tone?: SurfaceTone
  padding?: SurfacePadding
  interactive?: boolean
}

export function LiquidSurface({
  tone = 'default',
  padding = 'md',
  interactive = false,
  className,
  ...props
}: LiquidSurfaceProps) {
  return (
    <div
      {...props}
      className={cx(
        'liquid-surface',
        `liquid-surface--${tone}`,
        `liquid-pad--${padding}`,
        interactive && 'liquid-surface--interactive',
        className,
      )}
    />
  )
}

interface LiquidButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  compact?: boolean
}

export function LiquidButton({
  active = false,
  compact = false,
  className,
  type = 'button',
  ...props
}: LiquidButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={cx(
        'liquid-button',
        active && 'liquid-button--active',
        compact && 'liquid-button--compact',
        className,
      )}
    />
  )
}

interface LiquidPillProps extends HTMLAttributes<HTMLSpanElement> {
  active?: boolean
}

export function LiquidPill({
  active = false,
  className,
  ...props
}: LiquidPillProps) {
  return (
    <span
      {...props}
      className={cx('liquid-pill', active && 'liquid-pill--active', className)}
    />
  )
}

interface LiquidStatusChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'good' | 'warn' | 'bad' | 'info' | 'idle'
  icon?: ReactNode
}

export function LiquidStatusChip({
  tone = 'idle',
  icon,
  children,
  className,
  ...props
}: LiquidStatusChipProps) {
  return (
    <span {...props} className={cx('liquid-status-chip', `is-${tone}`, className)}>
      {icon && <span className="liquid-status-chip__icon">{icon}</span>}
      {children}
    </span>
  )
}

export function liquidGlassStyle(extra?: CSSProperties): CSSProperties {
  return {
    background: 'var(--liquid-surface)',
    border: '1px solid var(--liquid-border)',
    borderRadius: 'var(--liquid-radius-md)',
    boxShadow: 'var(--liquid-shadow)',
    backdropFilter: 'var(--liquid-blur)',
    WebkitBackdropFilter: 'var(--liquid-blur)',
    ...extra,
  }
}
