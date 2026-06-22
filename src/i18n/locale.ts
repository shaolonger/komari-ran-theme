import type { Locale, LocaleSetting } from './types'

export const SUPPORTED_LOCALES = ['zh-CN', 'en-US'] as const satisfies readonly Locale[]
export const DEFAULT_LOCALE: Locale = 'en-US'
export const LOCALE_STORAGE_KEY = 'ran.locale'
export const LOCALE_USER_SET_KEY = 'ran.locale.user'

export const LOCALE_LABELS: Record<Locale, string> = {
  'zh-CN': '简体中文',
  'en-US': 'English',
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && SUPPORTED_LOCALES.includes(value as Locale)
}

export function normalizeLocale(value: unknown): Locale | null {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw) return null
  if (isLocale(raw)) return raw

  const lower = raw.toLowerCase().replace('_', '-')
  if (
    lower === 'zh' ||
    lower === 'zh-cn' ||
    lower === 'zh-hans' ||
    lower.startsWith('zh-hans-') ||
    lower.startsWith('zh-cn-')
  ) {
    return 'zh-CN'
  }
  if (lower === 'en' || lower === 'en-us' || lower.startsWith('en-')) {
    return 'en-US'
  }
  return null
}

export function normalizeLocaleSetting(value: unknown): LocaleSetting | null {
  if (typeof value === 'string' && value.trim().toLowerCase() === 'auto') return 'auto'
  return normalizeLocale(value)
}

export function browserLocale(): Locale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE
  const candidates = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
  ].filter(Boolean)
  for (const candidate of candidates) {
    const locale = normalizeLocale(candidate)
    if (locale) return locale
  }
  return DEFAULT_LOCALE
}

export function resolveLocaleSetting(value: unknown): Locale | null {
  const setting = normalizeLocaleSetting(value)
  if (setting === 'auto') return browserLocale()
  return setting
}

export function readUserLocalePreference(): Locale | null {
  if (typeof localStorage === 'undefined') return null
  try {
    if (localStorage.getItem(LOCALE_USER_SET_KEY) !== '1') return null
    return normalizeLocale(localStorage.getItem(LOCALE_STORAGE_KEY))
  } catch {
    return null
  }
}

export function hasUserLocalePreference(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem(LOCALE_USER_SET_KEY) === '1'
  } catch {
    return false
  }
}

export function writeUserLocalePreference(locale: Locale): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    localStorage.setItem(LOCALE_USER_SET_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function clearUserLocalePreference(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(LOCALE_STORAGE_KEY)
    localStorage.removeItem(LOCALE_USER_SET_KEY)
  } catch {
    /* ignore */
  }
}
