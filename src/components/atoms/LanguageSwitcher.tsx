import { useEffect, useRef, useState } from 'react'
import {
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  useI18n,
  type Locale,
} from '@/i18n'

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function choose(next: Locale) {
    setLocale(next)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('locale.switcherLabel')}
        title={`${t('locale.currentLanguage')}: ${LOCALE_LABELS[locale]}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          fontWeight: 500,
          color: 'var(--fg-1)',
          background: open ? 'var(--bg-3)' : 'var(--bg-inset)',
          border: '1px solid var(--edge-engrave)',
          borderRadius: 4,
          cursor: 'pointer',
          boxShadow: 'inset 0 1px 0 var(--edge-deep), inset 0 -1px 0 var(--edge-bright)',
          transition: 'background 120ms',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 14,
            height: 14,
            borderRadius: 999,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
            color: 'var(--accent-bright)',
            border: '1px solid color-mix(in srgb, var(--accent) 34%, var(--edge-engrave))',
            fontSize: 8,
            lineHeight: 1,
          }}
        >
          文
        </span>
        <span>{t('locale.short')}</span>
        <span
          aria-hidden="true"
          style={{
            fontSize: 8,
            opacity: 0.6,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 120ms',
          }}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t('locale.switcherLabel')}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            minWidth: 154,
            background: 'var(--bg-1)',
            border: '1px solid var(--edge-mid)',
            borderRadius: 4,
            boxShadow: '0 1px 0 var(--edge-bright) inset, 0 4px 14px rgba(0,0,0,0.18)',
            padding: 3,
            zIndex: 31,
          }}
        >
          {SUPPORTED_LOCALES.map((option) => {
            const active = option === locale
            return (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => choose(option)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  width: '100%',
                  padding: '7px 9px',
                  border: 'none',
                  background: active ? 'var(--bg-3)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  borderRadius: 3,
                  borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                  color: active ? 'var(--fg-0)' : 'var(--fg-1)',
                }}
                onMouseEnter={(event) => {
                  if (!active) event.currentTarget.style.background = 'var(--bg-2)'
                }}
                onMouseLeave={(event) => {
                  if (!active) event.currentTarget.style.background = 'transparent'
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 12,
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  {LOCALE_LABELS[option]}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    color: active ? 'var(--accent-bright)' : 'var(--fg-3)',
                    letterSpacing: '0.12em',
                  }}
                >
                  {option}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
