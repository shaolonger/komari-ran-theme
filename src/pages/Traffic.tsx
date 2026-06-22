import { useMemo, useState } from 'react'
import { Sidebar } from '@/components/panels/Sidebar'
import { Topbar } from '@/components/panels/Topbar'
import { CardFrame } from '@/components/panels/CardFrame'
import { HeroStats } from '@/components/panels/HeroStats'
import { Footer } from '@/components/panels/Footer'
import { Etch } from '@/components/atoms/Etch'
import { Numeric } from '@/components/atoms/Numeric'
import { SerialPlate } from '@/components/atoms/SerialPlate'
import { Segmented } from '@/components/atoms/Segmented'
import { StatusDot } from '@/components/atoms/StatusDot'
import { AreaChart } from '@/components/charts/AreaChart'
import { BarChart } from '@/components/charts/BarChart'
import type { TrafficNodeSummary, TrafficQuality, TrafficRangePreset } from '@/api/client'
import type { KomariNode, KomariPublicConfig, KomariRecord } from '@/types/komari'
import type { GlobalHistoryState } from '@/hooks/useGlobalHistory'
import { useTrafficAnalytics } from '@/hooks/useTrafficAnalytics'
import { formatBps, formatBytes, formatPercent } from '@/utils/format'
import { contentFs } from '@/utils/fontScale'
import { hashFor } from '@/router/route'
import { useMobileDrawer } from '@/hooks/useMediaQuery'
import { type Theme } from '@/components/atoms/ThemePicker'
import { useI18n } from '@/i18n'

type Conn = 'connecting' | 'open' | 'closed' | 'error' | 'idle'
type SortBy = 'total' | 'up' | 'down' | 'peak'
type ScopeMode = 'all' | 'single' | 'multi'
type RangeMode = TrafficRangePreset | 'custom'

interface Props {
  nodes: KomariNode[]
  records: Record<string, KomariRecord>
  theme: Theme
  onTheme: (t: Theme) => void
  siteName?: string
  conn?: Conn
  lastUpdate?: number | null
  history?: GlobalHistoryState
  config?: KomariPublicConfig
  hubTargetUuid?: string
}

const SORT_LABELS: Record<SortBy, string> = {
  total: 'TOTAL',
  up: 'OUT',
  down: 'IN',
  peak: 'PEAK',
}

function toLocalInputValue(date: Date): string {
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromLocalInputValue(value: string): Date | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : undefined
}

function qualityLabel(quality: TrafficQuality): string {
  switch (quality) {
    case 'exact':
      return '精确'
    case 'estimated':
      return '估算'
    case 'partial':
      return '部分'
    default:
      return '无数据'
  }
}

function qualityTone(quality: TrafficQuality): 'good' | 'warn' | 'bad' {
  if (quality === 'exact') return 'good'
  if (quality === 'estimated' || quality === 'partial') return 'warn'
  return 'bad'
}

function nodeNameMap(nodes: KomariNode[]): Map<string, KomariNode> {
  return new Map(nodes.map((node) => [node.uuid, node]))
}

export function TrafficPage({
  nodes,
  records,
  theme,
  onTheme,
  siteName = '岚 · Komari',
  conn = 'idle',
  lastUpdate,
  config,
  hubTargetUuid,
}: Props) {
  const { t } = useI18n()
  const drawer = useMobileDrawer()
  const now = useMemo(() => new Date(), [])
  const [rangeMode, setRangeMode] = useState<RangeMode>('today')
  const [scopeMode, setScopeMode] = useState<ScopeMode>('all')
  const [singleUuid, setSingleUuid] = useState(() => nodes[0]?.uuid ?? '')
  const [multiUuids, setMultiUuids] = useState<string[]>(() =>
    nodes.slice(0, Math.min(3, nodes.length)).map((node) => node.uuid),
  )
  const [customFrom, setCustomFrom] = useState(() =>
    toLocalInputValue(new Date(now.getTime() - 24 * 60 * 60 * 1000)),
  )
  const [customTo, setCustomTo] = useState(() => toLocalInputValue(now))
  const [sortBy, setSortBy] = useState<SortBy>('total')

  const visibleNodeMap = useMemo(() => nodeNameMap(nodes), [nodes])
  const effectiveSingleUuid = singleUuid || nodes[0]?.uuid || ''
  const effectiveMultiUuids =
    multiUuids.length > 0
      ? multiUuids
      : nodes.slice(0, Math.min(3, nodes.length)).map((node) => node.uuid)
  const selectedUuids = useMemo(() => {
    if (scopeMode === 'single') return effectiveSingleUuid ? [effectiveSingleUuid] : []
    if (scopeMode === 'multi') return effectiveMultiUuids
    return undefined
  }, [effectiveMultiUuids, effectiveSingleUuid, scopeMode])
  const customStart = fromLocalInputValue(customFrom)
  const customEnd = fromLocalInputValue(customTo)
  const customValid = !customStart || !customEnd ? false : customEnd > customStart
  const traffic = useTrafficAnalytics({
    preset: rangeMode === 'custom' ? undefined : rangeMode,
    from: rangeMode === 'custom' ? customStart : undefined,
    to: rangeMode === 'custom' ? customEnd : undefined,
    uuids: selectedUuids,
    groupBy: 'auto',
    enabled: nodes.length > 0 && (rangeMode !== 'custom' || customValid),
    refreshMs: 60_000,
  })

  const summary = traffic.data.summary
  const sortedNodes = useMemo(() => {
    const sorters: Record<SortBy, (a: TrafficNodeSummary, b: TrafficNodeSummary) => number> = {
      total: (a, b) => b.total - a.total,
      up: (a, b) => b.up - a.up,
      down: (a, b) => b.down - a.down,
      peak: (a, b) => b.peak_bps - a.peak_bps,
    }
    return [...traffic.data.nodes].sort(sorters[sortBy])
  }, [sortBy, traffic.data.nodes])

  const chartData = useMemo(() => {
    const series = traffic.data.series ?? []
    return series.map((bucket) => bucket.total)
  }, [traffic.data.series])
  const chartTimes = useMemo(() => {
    return (traffic.data.series ?? []).map((bucket) => new Date(bucket.time).getTime())
  }, [traffic.data.series])
  const comparisonNodes = sortedNodes.slice(0, 12)
  const comparisonData = comparisonNodes.map((node) => node.total)
  const comparisonLabels = comparisonNodes.map((node) => node.name || node.uuid.slice(0, 8))

  const onlineCount = useMemo(() => {
    return nodes.reduce((count, node) => count + (records[node.uuid]?.online ? 1 : 0), 0)
  }, [nodes, records])

  const scopeLabel =
    scopeMode === 'all'
      ? `${nodes.length} ${t('common.nodes')}`
      : scopeMode === 'single'
        ? visibleNodeMap.get(effectiveSingleUuid)?.name ?? t('common.node')
        : `${effectiveMultiUuids.length} ${t('common.nodes')}`
  const rangeLabel = rangeMode === 'today' ? '今日' : rangeMode === '3d' ? '近 3 天' : rangeMode === '7d' ? '近 7 天' : '自定义'
  const subtitle = `${scopeLabel} · ${rangeLabel} · ${formatBytes(summary.total)}`

  const heroStats = useMemo(() => {
    const totalStr = formatBytes(summary.total).split(' ')
    const upStr = formatBytes(summary.up).split(' ')
    const downStr = formatBytes(summary.down).split(' ')
    const peakStr = formatBps(summary.peak_bps).split(' ')
    return [
      {
        label: '区间总流量',
        code: 'T01',
        value: totalStr[0] || '0',
        unit: totalStr[1] || 'B',
        spark: chartData,
        sparkColor: 'var(--accent)',
      },
      {
        label: '出站 ↑',
        code: 'T02',
        value: upStr[0] || '0',
        unit: upStr[1] || 'B',
        spark: (traffic.data.series ?? []).map((bucket) => bucket.up),
        sparkColor: 'var(--accent-bright)',
      },
      {
        label: '进站 ↓',
        code: 'T03',
        value: downStr[0] || '0',
        unit: downStr[1] || 'B',
        spark: (traffic.data.series ?? []).map((bucket) => bucket.down),
        sparkColor: 'var(--signal-good)',
      },
      {
        label: '峰值区间速率',
        code: 'T04',
        value: peakStr[0] || '0',
        unit: peakStr[1] ? peakStr[1].replace('/s', '') : 'B',
        spark: chartData,
        sparkColor: 'var(--signal-info)',
      },
    ]
  }, [chartData, summary, traffic.data.series])

  const toggleMultiUuid = (uuid: string) => {
    setMultiUuids((current) =>
      current.includes(uuid) ? current.filter((id) => id !== uuid) : [...current, uuid],
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        background: 'transparent',
        color: 'var(--fg-0)',
        fontFamily: 'var(--font-sans)',
        minHeight: '100vh',
      }}
    >
      <Sidebar active="traffic" mobileOpen={drawer.open} onMobileClose={drawer.onClose} hubTargetUuid={hubTargetUuid} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar
          title={siteName}
          subtitle={subtitle}
          theme={theme}
          onTheme={onTheme}
          online={onlineCount}
          total={nodes.length}
          lastUpdate={lastUpdate}
          conn={conn}
          onMobileMenu={drawer.onOpen}
          nodes={nodes}
          records={records}
        />

        <main className="app-main" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: contentFs(20),
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  color: 'var(--fg-0)',
                }}
              >
                {t('pages.traffic.title')}
              </h2>
              <SerialPlate>TRAFFIC · ANALYTICS</SerialPlate>
              <Etch>{traffic.loading ? 'SYNCING' : qualityLabel(summary.quality).toUpperCase()} · RANGE</Etch>
            </div>
            <button
              type="button"
              onClick={traffic.refetch}
              style={{
                border: '1px solid var(--edge-highlight)',
                background: 'var(--bg-glass)',
                color: 'var(--fg-1)',
                borderRadius: 999,
                padding: '7px 12px',
                fontFamily: 'var(--font-mono)',
                fontSize: contentFs(10),
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              刷新
            </button>
          </div>

          <CardFrame title="筛选范围" code="F · 01" inset>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 14,
                padding: 14,
              }}
            >
              <ControlBlock label="时间范围">
                <Segmented
                  size="sm"
                  value={rangeMode}
                  onChange={(v) => setRangeMode(v as RangeMode)}
                  options={[
                    { value: 'today', label: '今日' },
                    { value: '3d', label: '近 3 天' },
                    { value: '7d', label: '近 7 天' },
                    { value: 'custom', label: '自定义' },
                  ]}
                />
              </ControlBlock>
              <ControlBlock label="节点范围">
                <Segmented
                  size="sm"
                  value={scopeMode}
                  onChange={(v) => setScopeMode(v as ScopeMode)}
                  options={[
                    { value: 'all', label: '全部' },
                    { value: 'single', label: '单台' },
                    { value: 'multi', label: '多选' },
                  ]}
                />
              </ControlBlock>
              <ControlBlock label="排序">
                <Segmented
                  size="sm"
                  value={sortBy}
                  onChange={(v) => setSortBy(v as SortBy)}
                  options={(Object.keys(SORT_LABELS) as SortBy[]).map((value) => ({
                    value,
                    label: SORT_LABELS[value],
                  }))}
                />
              </ControlBlock>
            </div>

            {rangeMode === 'custom' && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                  padding: '0 14px 14px',
                }}
              >
                <DateField label="开始时间" value={customFrom} onChange={setCustomFrom} />
                <DateField label="结束时间" value={customTo} onChange={setCustomTo} />
                {!customValid && (
                  <div
                    style={{
                      alignSelf: 'end',
                      color: 'var(--signal-warn)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: contentFs(11),
                      letterSpacing: '0.08em',
                    }}
                  >
                    请选择有效的开始和结束时间
                  </div>
                )}
              </div>
            )}

            {scopeMode === 'single' && (
              <div style={{ padding: '0 14px 14px' }}>
                <NodeSelect nodes={nodes} value={effectiveSingleUuid} onChange={setSingleUuid} />
              </div>
            )}

            {scopeMode === 'multi' && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  padding: '0 14px 14px',
                }}
              >
                {nodes.map((node) => {
                  const active = effectiveMultiUuids.includes(node.uuid)
                  return (
                    <button
                      key={node.uuid}
                      type="button"
                      onClick={() => toggleMultiUuid(node.uuid)}
                      style={{
                        border: `1px solid ${active ? 'var(--accent)' : 'var(--edge-engrave)'}`,
                        background: active ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'var(--bg-inset)',
                        color: active ? 'var(--fg-0)' : 'var(--fg-2)',
                        borderRadius: 999,
                        padding: '7px 10px',
                        fontSize: contentFs(11),
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: '0.04em',
                        cursor: 'pointer',
                      }}
                    >
                      {node.name}
                    </button>
                  )
                })}
              </div>
            )}
          </CardFrame>

          {traffic.error && (
            <CardFrame title="数据接口不可用" code="E · API">
              <div style={{ color: 'var(--signal-warn)', fontSize: contentFs(12), lineHeight: 1.7 }}>
                新版区间流量 API 暂时无法读取：{traffic.error}
              </div>
            </CardFrame>
          )}

          <HeroStats stats={heroStats} />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            <QualityPill label="数据质量" value={qualityLabel(summary.quality)} tone={qualityTone(summary.quality)} />
            <QualityPill label="覆盖率" value={formatPercent(summary.coverage * 100)} tone={summary.coverage >= 0.8 ? 'good' : 'warn'} />
            <QualityPill label="计数器重置" value={`${summary.resets}`} tone={summary.resets > 0 ? 'warn' : 'good'} />
            <QualityPill label="样本数" value={`${summary.samples}`} tone={summary.samples > 0 ? 'good' : 'bad'} />
          </div>

          <CardFrame
            title={`区间流量趋势 · ${traffic.data.group_by.toUpperCase()}`}
            code="T · 06"
            action={<Etch>{traffic.data.from.slice(0, 10)} → {traffic.data.to.slice(0, 10)}</Etch>}
          >
            <AreaChart
              data={chartData.length > 0 ? chartData : [0]}
              width={1000}
              height={190}
              color="var(--accent)"
              yMin={0}
              yMax={Math.max(...chartData, 1) * 1.2 || 1}
              gradientId="traffic-analytics-trend"
              times={chartTimes}
              formatValue={(v) => `${formatBytes(v)}`}
            />
          </CardFrame>

          <CardFrame
            title={scopeMode === 'single' ? '单节点区间构成' : '节点流量对比'}
            code={`C · ${String(comparisonNodes.length).padStart(2, '0')}`}
            action={<Etch>{SORT_LABELS[sortBy]}</Etch>}
          >
            <BarChart
              data={comparisonData.length > 0 ? comparisonData : [0]}
              width={1000}
              height={150}
              color="var(--accent)"
              labels={comparisonLabels.length > 0 ? comparisonLabels : ['—']}
            />
          </CardFrame>

          <TrafficTable rows={sortedNodes} records={records} nodeMap={visibleNodeMap} />
        </main>

        <Footer config={config} />
      </div>
    </div>
  )
}

function ControlBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Etch>{label.toUpperCase()}</Etch>
      {children}
    </div>
  )
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Etch>{label.toUpperCase()}</Etch>
      <input
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        style={{
          border: '1px solid var(--edge-engrave)',
          background: 'var(--bg-inset)',
          color: 'var(--fg-0)',
          borderRadius: 12,
          padding: '10px 12px',
          fontFamily: 'var(--font-mono)',
          fontSize: contentFs(12),
        }}
      />
    </label>
  )
}

function NodeSelect({
  nodes,
  value,
  onChange,
}: {
  nodes: KomariNode[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      style={{
        width: '100%',
        border: '1px solid var(--edge-engrave)',
        background: 'var(--bg-inset)',
        color: 'var(--fg-0)',
        borderRadius: 12,
        padding: '10px 12px',
        fontFamily: 'var(--font-mono)',
        fontSize: contentFs(12),
      }}
    >
      {nodes.map((node) => (
        <option key={node.uuid} value={node.uuid}>
          {node.name}
        </option>
      ))}
    </select>
  )
}

function QualityPill({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'good' | 'warn' | 'bad'
}) {
  const color =
    tone === 'good'
      ? 'var(--signal-good)'
      : tone === 'warn'
        ? 'var(--signal-warn)'
        : 'var(--signal-bad)'
  return (
    <div
      style={{
        border: '1px solid var(--edge-engrave)',
        background: 'var(--bg-glass)',
        borderRadius: 16,
        padding: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <StatusDot status={tone} size={7} />
        <Etch>{label.toUpperCase()}</Etch>
      </div>
      <Numeric value={value} size={15} weight={600} color={color} />
    </div>
  )
}

function TrafficTable({
  rows,
  records,
  nodeMap,
}: {
  rows: TrafficNodeSummary[]
  records: Record<string, KomariRecord>
  nodeMap: Map<string, KomariNode>
}) {
  const { t } = useI18n()
  if (rows.length === 0) {
    return (
      <CardFrame title="节点明细" code="N · 00">
        <div
          style={{
            padding: '42px 16px',
            textAlign: 'center',
            color: 'var(--fg-3)',
            fontFamily: 'var(--font-mono)',
            fontSize: contentFs(11),
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          {t('common.empty')}
        </div>
      </CardFrame>
    )
  }

  const maxTotal = Math.max(...rows.map((row) => row.total), 1)
  return (
    <CardFrame title="节点明细" code={`N · ${String(rows.length).padStart(2, '0')}`} inset>
      <div>
        <div
          className="traffic-talkers-header"
          style={{
            display: 'grid',
            gridTemplateColumns: '32px minmax(160px, 1.4fr) 92px 120px 120px 120px 110px minmax(140px, 1fr)',
            gap: 10,
            padding: '8px 14px',
            borderBottom: '1px solid var(--edge-engrave)',
            background: 'var(--bg-1)',
            fontSize: contentFs(9),
            fontFamily: 'var(--font-mono)',
            color: 'var(--fg-3)',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          <span>#</span>
          <span>{t('common.node').toUpperCase()}</span>
          <span>{t('common.region').toUpperCase()}</span>
          <span style={{ textAlign: 'right' }}>出站</span>
          <span style={{ textAlign: 'right' }}>进站</span>
          <span style={{ textAlign: 'right' }}>峰值</span>
          <span>质量</span>
          <span>占比</span>
        </div>
        {rows.map((row, index) => {
          const live = records[row.uuid]
          const sourceNode = nodeMap.get(row.uuid)
          return (
            <a
              key={row.uuid}
              href={hashFor({ name: 'nodes', uuid: row.uuid })}
              className="traffic-talkers-row"
              style={{
                display: 'grid',
                gridTemplateColumns: '32px minmax(160px, 1.4fr) 92px 120px 120px 120px 110px minmax(140px, 1fr)',
                gap: 10,
                padding: '11px 14px',
                borderBottom: index < rows.length - 1 ? '1px solid var(--edge-engrave)' : 'none',
                alignItems: 'center',
                textDecoration: 'none',
                color: 'inherit',
                fontSize: contentFs(12),
              }}
            >
              <span className="mono" style={{ color: 'var(--fg-3)', fontSize: contentFs(11) }}>
                {String(index + 1).padStart(2, '0')}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <StatusDot status={live?.online ? 'good' : 'bad'} size={6} />
                <span
                  style={{
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={row.name}
                >
                  {sourceNode?.flag && (
                    <span
                      style={{
                        fontSize: contentFs(9),
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--accent-bright)',
                        letterSpacing: '0.12em',
                        marginRight: 6,
                      }}
                    >
                      {sourceNode.flag}
                    </span>
                  )}
                  {row.name || row.uuid}
                </span>
              </div>
              <span>
                <SerialPlate>{row.region || '—'}</SerialPlate>
              </span>
              <span className="mono tnum" style={{ textAlign: 'right', color: 'var(--accent-bright)' }}>
                {formatBytes(row.up)}
              </span>
              <span className="mono tnum" style={{ textAlign: 'right', color: 'var(--signal-good)' }}>
                {formatBytes(row.down)}
              </span>
              <span className="mono tnum" style={{ textAlign: 'right', color: 'var(--signal-info)' }}>
                {formatBps(row.peak_bps)}
              </span>
              <span>
                <SerialPlate>{qualityLabel(row.quality)}</SerialPlate>
              </span>
              <span>
                <ShareBar up={row.up} down={row.down} max={maxTotal} />
              </span>
            </a>
          )
        })}
      </div>
    </CardFrame>
  )
}

function ShareBar({ up, down, max }: { up: number; down: number; max: number }) {
  const total = up + down
  const totalPct = max > 0 ? (total / max) * 100 : 0
  const upRatio = total > 0 ? up / total : 0
  return (
    <div
      style={{
        height: 8,
        background: 'var(--bg-inset)',
        border: '1px solid var(--edge-engrave)',
        borderRadius: 999,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: `${totalPct * upRatio}%`,
          background: 'var(--accent-bright)',
          opacity: 0.9,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: `${totalPct * upRatio}%`,
          top: 0,
          bottom: 0,
          width: `${totalPct * (1 - upRatio)}%`,
          background: 'var(--signal-good)',
          opacity: 0.9,
        }}
      />
    </div>
  )
}
