import { useEffect, type ReactNode } from 'react'
import { Etch } from '@/components/atoms/Etch'
import { Icon } from '@/components/atoms/icons'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { hashFor, type Route } from '@/router/route'
import { useI18n, type MessageKey } from '@/i18n'

interface NavItem {
  id: Route['name']
  labelKey: MessageKey
  icon: ReactNode
  /** Pages that exist; others render as visible-but-disabled. */
  enabled: boolean
  /** When set, this nav item links to a dynamic uuid-suffixed route instead of the bare name. */
  uuidLink?: string
}

const NAV_BASE: Omit<NavItem, 'enabled' | 'uuidLink'>[] = [
  { id: 'overview', labelKey: 'nav.overview', icon: Icon.server },
  { id: 'nodes', labelKey: 'nav.nodes', icon: Icon.cpu },
  { id: 'hub', labelKey: 'nav.hub', icon: Icon.hub },
  { id: 'traffic', labelKey: 'nav.traffic', icon: Icon.net },
  { id: 'latency', labelKey: 'nav.latency', icon: Icon.ping },
  { id: 'billing', labelKey: 'nav.billing', icon: Icon.settings },
  { id: 'map', labelKey: 'nav.map', icon: Icon.globe },
]

interface Props {
  active: Route['name']
  version?: string
  /**
   * Default uuid the Hub link should target. The Hub page lives at
   * `#/hub/{uuid}` — there's no listing view, so the sidebar entry needs a
   * concrete node to point at. Callers should pass a sensible default
   * (typically the first online node). When undefined, the Hub item
   * disables itself rather than dead-ending on an empty uuid.
   */
  hubTargetUuid?: string
  /**
   * When true, the sidebar is being rendered on a different HTML entry
   * (e.g. map.html). All non-map links must point back to ./index.html#/...
   * instead of relying on hash-only navigation, otherwise the browser would
   * just update the hash on the current map.html page and nothing happens.
   */
  crossPage?: boolean
  /**
   * Mobile-drawer state. When the viewport is narrow (< md) the sidebar
   * leaves the document flow and slides in from the left as a fixed-position
   * drawer over the main content. Callers pass these from a Topbar hamburger
   * button. On desktop these props are ignored.
   */
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({
  active,
  version = 'v2.1.1',
  hubTargetUuid,
  crossPage = false,
  mobileOpen = false,
  onMobileClose,
}: Props) {
  const isMobile = useIsMobile()
  const { t } = useI18n()

  // Auto-close the drawer on route change. Hash-routes update the URL hash,
  // cross-page nav updates pathname; both should dismiss the drawer.
  useEffect(() => {
    if (!isMobile || !mobileOpen) return
    const close = () => onMobileClose?.()
    window.addEventListener('hashchange', close)
    window.addEventListener('popstate', close)
    return () => {
      window.removeEventListener('hashchange', close)
      window.removeEventListener('popstate', close)
    }
  }, [isMobile, mobileOpen, onMobileClose])

  // Lock body scroll while the mobile drawer is open. Otherwise the page
  // behind the overlay still scrolls under the user's finger, which feels
  // broken on iOS Safari.
  useEffect(() => {
    if (!isMobile) return
    if (mobileOpen) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [isMobile, mobileOpen])

  const nav: NavItem[] = NAV_BASE.map((item) => {
    if (item.id === 'hub') {
      return {
        ...item,
        enabled: !!hubTargetUuid,
        uuidLink: hubTargetUuid,
      }
    }
    return { ...item, enabled: true }
  })

  // Mobile-drawer mode lifts the aside out of the document flow and
  // slide-transitions it in from the left. Desktop mode keeps the existing
  // sticky-rail layout — same visual, just placement changes.
  const asideStyle: React.CSSProperties = isMobile
    ? {
        width: 268,
        background: 'var(--liquid-surface-strong, var(--bg-1))',
        border: '1px solid var(--liquid-border, var(--edge-mid))',
        borderRadius: '0 var(--liquid-radius-lg, 24px) var(--liquid-radius-lg, 24px) 0',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 10,
        bottom: 10,
        left: 0,
        zIndex: 51,
        transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)',
        boxShadow: mobileOpen ? 'var(--liquid-shadow, 4px 0 24px rgba(0,0,0,0.28))' : 'none',
        overflowY: 'auto',
        backdropFilter: 'var(--liquid-blur, none)',
        WebkitBackdropFilter: 'var(--liquid-blur, none)',
        // Disable pointer events when offscreen so it can't accidentally
        // intercept touch on the underlying main content.
        pointerEvents: mobileOpen ? 'auto' : 'none',
        // Respect iOS notch/safe area.
        paddingLeft: 'env(safe-area-inset-left)',
      }
    : {
        width: 220,
        margin: '12px 0 12px 12px',
        background: 'var(--liquid-surface-strong, var(--bg-1))',
        border: '1px solid var(--liquid-border, var(--edge-mid))',
        borderRadius: 'var(--liquid-radius-lg, var(--radius-lg))',
        boxShadow: 'var(--liquid-shadow, none)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        position: 'sticky',
        top: 12,
        height: 'calc(100vh - 24px)',
        alignSelf: 'flex-start',
        overflowY: 'auto',
        backdropFilter: 'var(--liquid-blur, none)',
        WebkitBackdropFilter: 'var(--liquid-blur, none)',
      }

  return (
    <>
      {/* Mobile overlay — tap to dismiss. Rendered as a sibling so
          its z-index sits below the aside. */}
      {isMobile && (
        <div
          onClick={onMobileClose}
          aria-hidden
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.42)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
            zIndex: 50,
            opacity: mobileOpen ? 1 : 0,
            pointerEvents: mobileOpen ? 'auto' : 'none',
            transition: 'opacity 200ms ease',
          }}
        />
      )}

      <aside style={asideStyle}>
        {/* Brand — clicking takes you home */}
        <div
          style={{
            padding: '14px 16px 12px',
            borderBottom: '1px solid var(--liquid-border, var(--edge-engrave))',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <a
            href={crossPage ? './' : hashFor({ name: 'overview' })}
            title={t('nav.homeTitle')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: 'inherit',
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                background: 'radial-gradient(circle at 30% 20%, var(--accent-bright), var(--accent) 48%, var(--accent-dim))',
                borderRadius: 10,
                border: '1px solid var(--liquid-border, var(--edge-deep))',
                boxShadow: '0 10px 26px color-mix(in srgb, var(--accent) 24%, transparent), 0 1px 0 var(--edge-bright) inset',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                fontSize: 11,
                color: 'var(--fg-mark)',
              }}
            >
              璃
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 13, fontWeight: 650, letterSpacing: '-0.01em' }}>RAN LIQUID</span>
              <Etch size={8}>GLASS · {version}</Etch>
            </div>
          </a>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', padding: 8, gap: 1 }}>
          {nav.map((item) => {
            const isActive = active === item.id
            const disabled = !item.enabled

            const linkProps = disabled
              ? { onClick: (e: React.MouseEvent) => e.preventDefault(), 'aria-disabled': true }
              : {
                  onClick: () => {
                    // On mobile, picking a nav item should close the drawer
                    // immediately. The hashchange listener also handles this
                    // for hash routes, but cross-page links don't fire one
                    // before navigation, so do it eagerly here.
                    if (isMobile) onMobileClose?.()
                  },
                }

            // Three cases:
            //   1. map → always points at ./map.html. On the map page itself
            //      this is effectively a no-op refresh; from anywhere else
            //      it loads the standalone geo page.
            //   2. hub → uuid-suffixed hash route.
            //   3. everything else → bare name hash route.
            //
            // On a cross-page render (i.e. the sidebar is shown on map.html),
            // non-map links need to navigate back to the main app's HTML file.
            // We prefix with './' (NOT './index.html') so the URL bar stays
            // clean — server serves index.html by default for the directory.
            const href =
              item.id === 'map'
                ? './map.html'
                : item.id === 'hub' && item.uuidLink
                  ? (crossPage ? './' : '') + hashFor({ name: 'hub', uuid: item.uuidLink })
                  : (crossPage ? './' : '') + hashFor({ name: item.id } as Route)

            return (
              <a
                key={item.id}
                href={href}
                {...linkProps}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 11px',
                  background: isActive ? 'color-mix(in srgb, var(--accent) 15%, var(--liquid-surface-soft, var(--bg-3)))' : 'transparent',
                  color: isActive ? 'var(--fg-0)' : disabled ? 'var(--fg-3)' : 'var(--fg-1)',
                  border: isActive ? '1px solid color-mix(in srgb, var(--accent) 40%, var(--liquid-border, var(--edge-mid)))' : '1px solid transparent',
                  borderRadius: 999,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 12,
                  textAlign: 'left',
                  position: 'relative',
                  boxShadow: isActive ? '0 1px 0 var(--edge-bright) inset, 0 0 24px color-mix(in srgb, var(--accent) 12%, transparent)' : 'none',
                  opacity: disabled ? 0.55 : 1,
                  textDecoration: 'none',
                }}
              >
                {isActive && (
                  <div
                    style={{
                      position: 'absolute',
                      left: -6,
                      top: 8,
                      bottom: 8,
                      width: 3,
                      borderRadius: 999,
                      background: 'var(--accent)',
                      boxShadow: '0 0 12px var(--accent)',
                    }}
                  />
                )}
                <span
                  style={{
                    display: 'inline-flex',
                    color: isActive ? 'var(--accent-bright)' : 'var(--fg-2)',
                  }}
                >
                  {item.icon}
                </span>
                {t(item.labelKey)}
              </a>
            )
          })}
        </nav>

        <div style={{ marginTop: 'auto', padding: 12, borderTop: '1px solid var(--liquid-border, var(--edge-engrave))' }}>
          {/* Admin entry — Komari 后台登录入口。
              做成"铭牌按钮"风格:跟 SerialPlate 同款蚀刻工艺,
              比之前的虚线小字醒目,但视觉权重控制在"管理员才用"的范围内。 */}
          <a
            href="/admin"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '8px 10px',
              marginBottom: 12,
              background: 'var(--liquid-surface-soft, var(--bg-1))',
              border: '1px solid var(--liquid-border, var(--edge-engrave))',
              borderRadius: 999,
              boxShadow: 'var(--shadow-button)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--fg-1)',
              textDecoration: 'none',
              cursor: 'pointer',
              transition: 'color 0.15s, background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--accent-bright)'
              e.currentTarget.style.background = 'var(--liquid-surface-strong, var(--bg-2))'
              e.currentTarget.style.borderColor = 'var(--accent)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--fg-1)'
              e.currentTarget.style.background = 'var(--liquid-surface-soft, var(--bg-1))'
              e.currentTarget.style.borderColor = 'var(--liquid-border, var(--edge-engrave))'
            }}
            title={t('nav.adminTitle')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {/* 小铭牌前缀 — 跟 OP-04A SerialPlate 视觉呼应 */}
              <span
                style={{
                  fontSize: 8,
                  color: 'var(--accent)',
                  letterSpacing: '0.2em',
                  fontWeight: 700,
                }}
              >
                ◇
              </span>
              <span style={{ fontWeight: 600 }}>{t('nav.adminSignIn')}</span>
            </span>
            <span
              style={{
                fontSize: 11,
                lineHeight: 1,
                color: 'var(--fg-3)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              →
            </span>
          </a>
        </div>
      </aside>
    </>
  )
}
