import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { createFormatters, type I18nFormatters } from './formatters'
import { enUS } from './locales/en-US'
import { zhCN } from './locales/zh-CN'
import {
  browserLocale,
  hasUserLocalePreference,
  LOCALE_STORAGE_KEY,
  LOCALE_USER_SET_KEY,
  readUserLocalePreference,
  resolveLocaleSetting,
  writeUserLocalePreference,
} from './locale'
import type { Locale, MessageKey, Messages, TranslationParams, Translator } from './types'

const DICTIONARIES: Record<Locale, Messages> = {
  'zh-CN': zhCN,
  'en-US': enUS,
}

interface I18nContextValue {
  locale: Locale
  dictionary: Messages
  format: I18nFormatters
  t: Translator
  setLocale: (locale: Locale) => void
  setSystemLocale: (locale: Locale) => void
}

const I18nContext = createContext<I18nContextValue | null>(null)

function readPath(messages: Messages, key: MessageKey): string | undefined {
  let current: unknown = messages
  for (const part of key.split('.')) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return typeof current === 'string' ? current : undefined
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key]
    return value === undefined || value === null ? match : String(value)
  })
}

function createTranslator(locale: Locale): Translator {
  return (key, params) => {
    const active = readPath(DICTIONARIES[locale], key)
    const fallback = readPath(DICTIONARIES['en-US'], key)
    return interpolate(active ?? fallback ?? key, params)
  }
}

function initialLocale(): Locale {
  return readUserLocalePreference() ?? browserLocale()
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== LOCALE_STORAGE_KEY && event.key !== LOCALE_USER_SET_KEY) return
      setLocaleState(readUserLocalePreference() ?? browserLocale())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const value = useMemo<I18nContextValue>(() => {
    const setLocale = (next: Locale) => {
      writeUserLocalePreference(next)
      setLocaleState(next)
    }
    const setSystemLocale = (next: Locale) => {
      if (hasUserLocalePreference()) return
      setLocaleState(next)
    }

    return {
      locale,
      dictionary: DICTIONARIES[locale],
      format: createFormatters(locale),
      t: createTranslator(locale),
      setLocale,
      setSystemLocale,
    }
  }, [locale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider')
  return ctx
}

export function useThemeDefaultLocale(rawDefaultLocale: unknown): void {
  const { setSystemLocale } = useI18n()
  useEffect(() => {
    const resolved = resolveLocaleSetting(rawDefaultLocale)
    if (resolved) setSystemLocale(resolved)
  }, [rawDefaultLocale, setSystemLocale])
}

export { createTranslator }
export {
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  clearUserLocalePreference,
  normalizeLocale,
  normalizeLocaleSetting,
} from './locale'
export type { Locale, LocaleSetting, MessageKey, Translator } from './types'
