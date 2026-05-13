/**
 * HealthTrend7DChart — 7-day health score trend line.
 *
 *   HEALTH TREND (7D)               [H02]
 *
 *   100 ─────────────────────────
 *    75 ─────●──●─●──●──●──●─●──●
 *    50 ─────────────────────────
 *    25 ─────────────────────────
 *
 *   May 9 · 10 · 11 · 12 · 13 · 14 · Today
 *
 * Driven by useHealthTrend(). When no data is collected yet, shows a
 * "collecting" placeholder.
 */

import type { TrendPoint } from '@/hooks/v2'
import { Etch } from '@/components/atoms/Etch'
import { SerialPlate } from '@/components/atoms/SerialPlate'
import { contentFs } from '@/utils/fontScale'
import { useIsMobile } from '@/hooks/useMediaQuery'

interface Props {
  points: TrendPoint[]
  /** Current score (used for the right-side big number) */
  currentScore?: number
  title?: string
  serial?: string
  /** Days window (default 7) */
  days?: number
}

function fmtDay(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function HealthTrend7DChart({
  points,
  currentScore,
  title = 'HEALTH TREND (7D)',
  serial = 'H02',
  days = 7,
}: Props) {
  const isMobile = useIsMobile()
  const w = 700
  const h = isMobile ? 110 : 140
  const pad = { l: 28, r: 14, t: 10, b: 22 }

  // Window: [now - days, now]
  const now = Date.now()
  const windowStart = now - days * 24 * 60 * 60 * 1000
  const visible = points.filter((p) => p.t >= windowStart)

  // Build day-tick positions for x axis
  const dayTicks: { t: number; label: string }[] = []
  for (let i = 0; i <= days; i++) {
    const t = windowStart + (i * (now - windowStart)) / days
    const d = new Date(t)
    dayTicks.push({ t, label: i === days ? 'Today' : fmtDay(d) })
  }

  const xFor = (t: number) => {
    const ratio = (t - windowStart) / (now - windowStart)
    return pad.l + ratio * (w - pad.l - pad.r)
  }
  const yFor = (score: number) => {
    return pad.t + (1 - score / 100) * (h - pad.t - pad.b)
  }

  // Build polyline
  const polylinePts = visible
    .map((p) => `${xFor(p.t).toFixed(1)},${yFor(p.score).toFixed(1)}`)
    .join(' ')

  // First / last delta
  const first = visible[0]
  const last = visible[visible.length - 1]
  const delta = first && last ? last.score - first.score : undefined

  return (
    <div className="precision-card" style={{ padding: '14px 18px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <Etch>{title}</Etch>
        <SerialPlate>{serial}</SerialPlate>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: 16,
          flexDirection: isMobile ? 'column' : 'row',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <svg
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio="none"
            style={{ width: '100%', height: h, display: 'block' }}
          >
            {/* Horizontal grid lines at 0/25/50/75/100 */}
            {[0, 25, 50, 75, 100].map((s) => (
              <g key={s}>
                <line
                  x1={pad.l}
                  y1={yFor(s)}
                  x2={w - pad.r}
                  y2={yFor(s)}
                  stroke="var(--edge-engrave)"
                  strokeWidth="0.5"
                  opacity={s === 0 || s === 100 ? 0.6 : 0.3}
                  strokeDasharray={s === 50 ? undefined : '2,3'}
                />
                <text
                  x={pad.l - 6}
                  y={yFor(s) + 3}
                  textAnchor="end"
                  fontFamily="var(--font-mono)"
                  fontSize="9"
                  fill="var(--fg-3)"
                  letterSpacing="0.08em"
                >
                  {s}
                </text>
              </g>
            ))}

            {visible.length >= 2 ? (
              <>
                <polyline
                  points={polylinePts}
                  fill="none"
                  stroke="var(--signal-good)"
                  strokeWidth="1.6"
                />
                {/* Dots */}
                {visible.map((p, i) => (
                  <circle
                    key={i}
                    cx={xFor(p.t)}
                    cy={yFor(p.score)}
                    r="2.5"
                    fill="var(--signal-good)"
                  />
                ))}
              </>
            ) : visible.length === 1 ? (
              <circle
                cx={xFor(visible[0].t)}
                cy={yFor(visible[0].score)}
                r="3"
                fill="var(--signal-good)"
              />
            ) : (
              <text
                x={w / 2}
                y={h / 2}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fontSize="11"
                fill="var(--fg-3)"
                letterSpacing="0.12em"
              >
                collecting trend data…
              </text>
            )}

            {/* X axis day ticks */}
            {dayTicks.map((tick, i) => (
              <text
                key={i}
                x={xFor(tick.t)}
                y={h - 5}
                textAnchor={i === 0 ? 'start' : i === dayTicks.length - 1 ? 'end' : 'middle'}
                fontFamily="var(--font-mono)"
                fontSize="9"
                fill="var(--fg-3)"
                letterSpacing="0.06em"
              >
                {tick.label}
              </text>
            ))}
          </svg>
        </div>

        {/* Right readout */}
        <div
          style={{
            display: 'flex',
            flexDirection: isMobile ? 'row' : 'column',
            gap: 4,
            minWidth: isMobile ? 0 : 110,
            paddingLeft: isMobile ? 0 : 8,
            borderLeft: isMobile ? 'none' : '1px solid var(--edge-engrave)',
            justifyContent: isMobile ? 'space-between' : 'center',
            alignItems: isMobile ? 'baseline' : 'flex-end',
          }}
        >
          {typeof currentScore === 'number' && (
            <div>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: contentFs(32),
                  color: 'var(--fg-0)',
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                }}
              >
                {currentScore}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: contentFs(12),
                  color: 'var(--fg-2)',
                }}
              >
                /100
              </span>
            </div>
          )}
          {typeof delta === 'number' && (
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: contentFs(10),
                color:
                  delta > 0 ? 'var(--signal-good)' : delta < 0 ? 'var(--signal-bad)' : 'var(--fg-3)',
                letterSpacing: '0.06em',
              }}
            >
              <span style={{ fontWeight: 500 }}>
                {delta > 0 ? '↑' : delta < 0 ? '↓' : '·'} {Math.abs(delta)} pts
              </span>{' '}
              <span style={{ color: 'var(--fg-3)' }}>vs {days}d ago</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
