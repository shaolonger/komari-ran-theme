import type { Locale } from './types'

const RELATIVE_UNITS = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
  ['second', 1],
] as const

export function createFormatters(locale: Locale) {
  const number = new Intl.NumberFormat(locale)
  const compact = new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  })
  const percent = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    style: 'percent',
  })
  const dateTime = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const fullDateTime = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const relative = new Intl.RelativeTimeFormat(locale, {
    numeric: 'auto',
    style: 'short',
  })

  return {
    number(value: number, options?: Intl.NumberFormatOptions) {
      return options ? new Intl.NumberFormat(locale, options).format(value) : number.format(value)
    },
    compact(value: number) {
      return compact.format(value)
    },
    percent(value: number) {
      return percent.format(value / 100)
    },
    ratio(value: number) {
      return percent.format(value)
    },
    dateTime(value: Date | number | string) {
      const date = value instanceof Date ? value : new Date(value)
      return Number.isNaN(date.getTime()) ? '' : dateTime.format(date)
    },
    fullDateTime(value: Date | number | string) {
      const date = value instanceof Date ? value : new Date(value)
      return Number.isNaN(date.getTime()) ? '' : fullDateTime.format(date)
    },
    relativeFromNow(value: Date | number | string) {
      const date = value instanceof Date ? value : new Date(value)
      if (Number.isNaN(date.getTime())) return ''
      const deltaSeconds = Math.round((date.getTime() - Date.now()) / 1000)
      const abs = Math.abs(deltaSeconds)
      for (const [unit, seconds] of RELATIVE_UNITS) {
        if (abs >= seconds || unit === 'second') {
          return relative.format(Math.round(deltaSeconds / seconds), unit)
        }
      }
      return relative.format(0, 'second')
    },
    duration(seconds: number) {
      if (!Number.isFinite(seconds) || seconds <= 0) return '0s'
      const days = Math.floor(seconds / 86400)
      const hours = Math.floor((seconds % 86400) / 3600)
      const minutes = Math.floor((seconds % 3600) / 60)
      if (days > 0) return `${days}d ${hours}h`
      if (hours > 0) return `${hours}h ${minutes}m`
      if (minutes > 0) return `${minutes}m`
      return `${Math.floor(seconds)}s`
    },
  }
}

export type I18nFormatters = ReturnType<typeof createFormatters>
