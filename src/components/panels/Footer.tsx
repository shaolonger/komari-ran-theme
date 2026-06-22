import type { KomariPublicConfig } from '@/types/komari'
import { useI18n } from '@/i18n'

/**
 * Footer — shared across all pages.
 *
 * Reads optional 备案 fields from theme_settings (set in the Komari admin):
 *   - icp_text / icp_url       工信部 ICP 备案
 *   - police_text / police_url 公安备案
 *
 * Behaviour:
 *   - If *_text is empty, the entry is omitted entirely.
 *   - If *_text is set but *_url is empty, renders as plain text (not a link).
 *   - GitHub repo link is always shown — the theme is open-source and we want
 *     to make redistribution easy.
 */

const REPO_URL = 'https://github.com/saladinxp/komari-ran-theme'

const linkStyle: React.CSSProperties = {
  color: 'inherit',
  textDecoration: 'none',
  borderBottom: '1px dotted var(--fg-3)',
  paddingBottom: 1,
}

const sepStyle: React.CSSProperties = {
  opacity: 0.4,
  margin: '0 8px',
}

interface FooterProps {
  version?: string
  config?: KomariPublicConfig
}

function readStr(obj: Record<string, unknown> | undefined, key: string): string {
  const v = obj?.[key]
  return typeof v === 'string' ? v.trim() : ''
}

/** Render a beian entry: link if url is given, plain text otherwise. */
function BeianEntry({ text, url, title }: { text: string; url: string; title: string }) {
  if (!text) return null
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={linkStyle}
        title={title}
      >
        {text}
      </a>
    )
  }
  return <span>{text}</span>
}

export function Footer({ version = 'v2.1.1', config }: FooterProps) {
  const { t } = useI18n()
  const ts = config?.theme_settings
  const icpText = readStr(ts, 'icp_text')
  const icpUrl = readStr(ts, 'icp_url')
  const policeText = readStr(ts, 'police_text')
  const policeUrl = readStr(ts, 'police_url')
  const text = readStr(ts, 'footer_text') || config?.footer_text || t('footer.poweredBy')

  const hasBeian = !!icpText || !!policeText

  return (
    <footer
      style={{
        padding: '12px 20px',
        borderTop: '1px solid var(--edge-engrave)',
        background: 'var(--bg-1)',
        color: 'var(--fg-3)',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.14em',
        display: 'flex',
        justifyContent: 'flex-start',
        alignItems: 'center',
        gap: 0,
        flexWrap: 'wrap',
        marginTop: 'auto',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap' }}>
        <span>{t('footer.themeLine', { version })}</span>
        <span style={sepStyle}>·</span>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
          title={t('footer.sourceTitle')}
        >
          MIULER
        </a>
        {text && <span style={sepStyle}>·</span>}
        {text && <span>{text}</span>}
        {hasBeian && <span style={sepStyle}>·</span>}
        {icpText && <BeianEntry text={icpText} url={icpUrl} title={t('footer.beianTitle')} />}
        {icpText && policeText && <span style={sepStyle}>·</span>}
        {policeText && <BeianEntry text={policeText} url={policeUrl} title={t('footer.beianTitle')} />}
      </span>
    </footer>
  )
}
