import { useMemo, useState, type ReactNode } from 'react'
import { Sidebar } from '@/components/panels/Sidebar'
import { Topbar } from '@/components/panels/Topbar'
import { CardFrame } from '@/components/panels/CardFrame'
import { HeroStats } from '@/components/panels/HeroStats'
import { Footer } from '@/components/panels/Footer'
import { Etch } from '@/components/atoms/Etch'
import { Segmented } from '@/components/atoms/Segmented'
import { SerialPlate } from '@/components/atoms/SerialPlate'
import { StatusDot } from '@/components/atoms/StatusDot'
import { Sparkline } from '@/components/charts/Sparkline'
import type { KomariNode, KomariPublicConfig, KomariRecord } from '@/types/komari'
import { useLatencyAnalytics } from '@/hooks/useLatencyAnalytics'
import { useMobileDrawer } from '@/hooks/useMediaQuery'
import { type Theme } from '@/components/atoms/ThemePicker'
import { useI18n } from '@/i18n'
import { hashFor } from '@/router/route'
import { contentFs } from '@/utils/fontScale'
import { formatPercent } from '@/utils/format'
import { filterWindowsByRetention, getPingRetentionHours } from '@/utils/retention'
import {
  formatLatencyMs,
  latencyTone,
  type LatencyBucket,
  type LatencyNodeInsight,
  type LatencyStatus,
  type LatencyTargetInsight,
} from '@/utils/latency'

type Conn = 'connecting' | 'open' | 'closed' | 'error' | 'idle'
type WindowId = 'live' | '1h' | '6h' | '24h' | '7d'
type SortBy = 'status' | 'latest' | 'p95' | 'loss' | 'name'

interface Props {
  nodes: KomariNode[]
  records: Record<string, KomariRecord>
  theme: Theme
  onTheme: (t: Theme) => void
  siteName?: string
  conn?: Conn
  lastUpdate?: number | null
  config?: KomariPublicConfig
  hubTargetUuid?: string
}

interface WindowOption {
  id: WindowId
  hours: number
  label: string
}

const STATUS_RANK: Record<LatencyStatus, number> = {
  bad: 3,
  warn: 2,
  good: 1,
  empty: 0,
}

function splitLatency(value: number | undefined): { value: string; unit: string } {
  const formatted = formatLatencyMs(value)
  const [rawValue, rawUnit] = formatted.split(' ')
  return { value: rawValue || '—', unit: rawUnit || 'ms' }
}

function statusLabel(status: LatencyStatus, t: ReturnType<typeof useI18n>['t']): string {
  if (status === 'good') return t('status.good')
  if (status === 'warn') return t('status.warn')
  if (status === 'bad') return t('status.bad')
  return t('common.empty')
}

function nodeSearchText(node: LatencyNodeInsight, source?: KomariNode): string {
  return [
    node.name,
    node.region,
    node.group,
    node.flag,
    source?.ip,
    source?.provider,
    source?.tags,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function LatencyPage({
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
  const [windowId, setWindowId] = useState<WindowId>('live')
  const [sortBy, setSortBy] = useState<SortBy>('status')
  const [query, setQuery] = useState('')

  const retentionHours = getPingRetentionHours(config)
  const windowOptions = useMemo<WindowOption[]>(() => {
    return filterWindowsByRetention(
      [
        { id: 'live', hours: 1, label: t('pages.latency.live') },
        { id: '1h', hours: 1, label: t('pages.latency.last1h') },
        { id: '6h', hours: 6, label: t('pages.latency.last6h') },
        { id: '24h', hours: 24, label: t('pages.latency.last24h') },
        { id: '7d', hours: 168, label: t('pages.latency.last7d') },
      ],
      retentionHours,
    )
  }, [retentionHours, t])

  const activeWindow = windowOptions.find((option) => option.id === windowId) ?? windowOptions[0]
  const latency = useLatencyAnalytics({
    nodes,
    records,
    hours: activeWindow?.hours ?? 1,
    enabled: nodes.length > 0,
    refreshMs: 60_000,
  })
  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.uuid, node])), [nodes])
  const onlineCount = useMemo(
    () => nodes.reduce((count, node) => count + (records[node.uuid]?.online ? 1 : 0), 0),
    [nodes, records],
  )
  const search = query.trim().toLowerCase()
  const visibleNodes = useMemo(() => {
    const filtered = search
      ? latency.data.nodes.filter((node) => nodeSearchText(node, nodeMap.get(node.uuid)).includes(search))
      : latency.data.nodes
    const sorted = [...filtered]
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'latest':
          return (b.latest ?? b.avg ?? 0) - (a.latest ?? a.avg ?? 0)
        case 'p95':
          return (b.p95 ?? b.latest ?? 0) - (a.p95 ?? a.latest ?? 0)
        case 'loss':
          return b.loss - a.loss
        case 'name':
          return a.name.localeCompare(b.name)
        default: {
          const statusDelta = STATUS_RANK[b.status] - STATUS_RANK[a.status]
          return statusDelta || (b.p95 ?? b.latest ?? 0) - (a.p95 ?? a.latest ?? 0)
        }
      }
    })
    return sorted
  }, [latency.data.nodes, nodeMap, search, sortBy])

  const summary = latency.data.summary
  const avg = splitLatency(summary.avg)
  const p95 = splitLatency(summary.p95)
  const worst = splitLatency(summary.worstNode?.latest ?? summary.worstNode?.p95)
  const heroStats = [
    {
      label: t('pages.latency.fleetAverage'),
      code: 'L01',
      value: avg.value,
      unit: avg.unit,
      spark: summary.spark,
      sparkColor: 'var(--accent)',
    },
    {
      label: t('pages.latency.p95Latency'),
      code: 'L02',
      value: p95.value,
      unit: p95.unit,
      spark: summary.spark,
      sparkColor: 'var(--signal-info)',
    },
    {
      label: t('pages.latency.packetLoss'),
      code: 'L03',
      value: formatPercent(summary.loss),
      unit: '',
      spark: visibleNodes.map((node) => node.loss),
      sparkColor: summary.loss >= 1 ? 'var(--signal-warn)' : 'var(--signal-good)',
    },
    {
      label: t('pages.latency.worstNow'),
      code: 'L04',
      value: worst.value,
      unit: worst.unit,
      spark: summary.worstNode?.spark,
      sparkColor: 'var(--signal-bad)',
    },
  ]

  const sortLabels: Record<SortBy, string> = {
    status: t('pages.latency.sortStatus'),
    latest: t('pages.latency.sortRealtime'),
    p95: t('pages.latency.sortP95'),
    loss: t('pages.latency.sortLoss'),
    name: t('pages.latency.sortName'),
  }
  const topDegraded = visibleNodes
    .filter((node) => node.status === 'bad' || node.status === 'warn')
    .slice(0, 8)
  const insightNodes = topDegraded.length > 0 ? topDegraded : visibleNodes.slice(0, 8)
  const subtitle = `${t('pages.latency.subtitle')} · ${t('pages.latency.reportingNodes', {
    count: summary.reportingNodes,
    total: nodes.length,
  })}`

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
      <Sidebar active="latency" mobileOpen={drawer.open} onMobileClose={drawer.onClose} hubTargetUuid={hubTargetUuid} />

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
          <PageHeader
            loading={latency.loading}
            onRefresh={latency.refetch}
            reporting={summary.reportingNodes}
          />

          <CardFrame title={t('pages.latency.filters')} code="L · F" inset>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 14,
                padding: 14,
              }}
            >
              <ControlBlock label={t('pages.latency.timeWindow')}>
                <Segmented
                  size="sm"
                  value={activeWindow?.id ?? 'live'}
                  onChange={(value) => setWindowId(value as WindowId)}
                  options={windowOptions.map((option) => ({
                    value: option.id,
                    label: option.label,
                  }))}
                />
              </ControlBlock>
              <ControlBlock label={t('pages.latency.sort')}>
                <Segmented
                  size="sm"
                  value={sortBy}
                  onChange={(value) => setSortBy(value as SortBy)}
                  options={(Object.keys(sortLabels) as SortBy[]).map((value) => ({
                    value,
                    label: sortLabels[value],
                  }))}
                />
              </ControlBlock>
              <ControlBlock label={t('pages.latency.search')}>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder={t('pages.latency.searchPlaceholder')}
                  style={{
                    border: '1px solid var(--edge-engrave)',
                    background: 'var(--bg-inset)',
                    color: 'var(--fg-0)',
                    borderRadius: 999,
                    padding: '9px 12px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: contentFs(11),
                    outline: 'none',
                  }}
                />
              </ControlBlock>
            </div>
          </CardFrame>

          {latency.error && (
            <CardFrame title={t('pages.latency.apiUnavailable')} code="E · API">
              <div style={{ color: 'var(--signal-warn)', fontSize: contentFs(12), lineHeight: 1.7 }}>
                {t('pages.latency.apiUnavailableDescription', { error: latency.error })}
              </div>
            </CardFrame>
          )}

          <HeroStats stats={heroStats} />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.8fr) minmax(280px, 0.8fr)',
              gap: 16,
              alignItems: 'stretch',
            }}
            className="latency-dashboard-grid"
          >
            <LatencyHeatmap rows={visibleNodes} loading={latency.loading} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
              <NodeInsightList rows={insightNodes} title={topDegraded.length > 0 ? t('pages.latency.attention') : t('pages.latency.stableLeaders')} />
              <TargetPanel targets={latency.data.targets.slice(0, 8)} />
            </div>
          </div>

          <LatencyTable rows={visibleNodes} nodeMap={nodeMap} />
        </main>

        <Footer config={config} />
      </div>
    </div>
  )
}

function PageHeader({
  loading,
  onRefresh,
  reporting,
}: {
  loading: boolean
  onRefresh: () => void
  reporting: number
}) {
  const { t } = useI18n()
  return (
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
          {t('pages.latency.title')}
        </h2>
        <SerialPlate>{t('pages.latency.analytics').toUpperCase()}</SerialPlate>
        <Etch>
          {(loading ? t('pages.latency.syncing') : t('pages.latency.reporting')).toUpperCase()} · {reporting}
        </Etch>
      </div>
      <button
        type="button"
        onClick={onRefresh}
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
        {t('pages.latency.refresh')}
      </button>
    </div>
  )
}

function ControlBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Etch>{label.toUpperCase()}</Etch>
      {children}
    </div>
  )
}

function bucketColor(bucket: LatencyBucket): string {
  if (bucket.samples <= 0 && bucket.loss < 0) return 'var(--bg-inset)'
  if (bucket.loss >= 50) return 'var(--signal-bad)'
  if (bucket.loss >= 5 || bucket.avg >= 300) return 'var(--signal-bad)'
  if (bucket.loss >= 1 || bucket.avg >= 150) return 'var(--signal-warn)'
  if (bucket.avg > 0) return 'var(--signal-good)'
  return 'var(--bg-inset)'
}

function LatencyHeatmap({
  rows,
  loading,
}: {
  rows: LatencyNodeInsight[]
  loading: boolean
}) {
  const { t } = useI18n()
  if (rows.length === 0) {
    return (
      <CardFrame title={t('pages.latency.heatmap')} code="H · 00">
        <EmptyState>{loading ? t('common.loading') : t('common.empty')}</EmptyState>
      </CardFrame>
    )
  }

  return (
    <CardFrame
      title={t('pages.latency.heatmap')}
      code={`H · ${String(rows.length).padStart(2, '0')}`}
      action={<Etch>{t('pages.latency.heatmapHint')}</Etch>}
      inset
    >
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 760 }}>
          <HeatmapHeader />
          {rows.map((node, index) => (
            <a
              key={node.uuid}
              href={hashFor({ name: 'nodes', uuid: node.uuid })}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(190px, 1.2fr) 90px minmax(380px, 2fr) 88px',
                gap: 12,
                alignItems: 'center',
                padding: '10px 14px',
                borderBottom: index < rows.length - 1 ? '1px solid var(--edge-engrave)' : 'none',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <NodeLabel node={node} />
              <span className="mono tnum" style={{ textAlign: 'right', color: 'var(--fg-0)', fontSize: contentFs(12) }}>
                {formatLatencyMs(node.latest ?? node.avg)}
              </span>
              <div
                aria-label={`${node.name} latency heatmap`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${node.buckets.length}, minmax(4px, 1fr))`,
                  gap: 2,
                  alignItems: 'center',
                }}
              >
                {node.buckets.map((bucket, bucketIndex) => (
                  <span
                    key={bucketIndex}
                    title={`${formatLatencyMs(bucket.avg)} · ${bucket.loss >= 0 ? formatPercent(bucket.loss) : t('common.empty')}`}
                    style={{
                      height: 18,
                      borderRadius: 4,
                      background: bucketColor(bucket),
                      opacity: bucket.samples <= 0 ? 0.32 : Math.max(0.45, Math.min(1, bucket.avg / 260 + 0.38)),
                      boxShadow: bucket.loss >= 5 ? '0 0 10px color-mix(in srgb, var(--signal-bad) 45%, transparent)' : 'none',
                    }}
                  />
                ))}
              </div>
              <span className="mono tnum" style={{ textAlign: 'right', color: node.loss >= 1 ? 'var(--signal-warn)' : 'var(--fg-2)', fontSize: contentFs(12) }}>
                {formatPercent(node.loss)}
              </span>
            </a>
          ))}
        </div>
      </div>
    </CardFrame>
  )
}

function HeatmapHeader() {
  const { t } = useI18n()
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(190px, 1.2fr) 90px minmax(380px, 2fr) 88px',
        gap: 12,
        padding: '8px 14px',
        borderBottom: '1px solid var(--edge-engrave)',
        background: 'var(--bg-1)',
        color: 'var(--fg-3)',
        fontFamily: 'var(--font-mono)',
        fontSize: contentFs(9),
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
      }}
    >
      <span>{t('common.node')}</span>
      <span style={{ textAlign: 'right' }}>{t('pages.latency.realtime')}</span>
      <span>{t('pages.latency.timeline')}</span>
      <span style={{ textAlign: 'right' }}>{t('pages.latency.loss')}</span>
    </div>
  )
}

function NodeLabel({ node }: { node: LatencyNodeInsight }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <StatusDot status={latencyTone(node.status)} size={7} />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 3 }}>
        <span
          style={{
            fontWeight: 550,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={node.name}
        >
          {node.flag && (
            <span
              style={{
                marginRight: 6,
                color: 'var(--accent-bright)',
                fontFamily: 'var(--font-mono)',
                fontSize: contentFs(9),
              }}
            >
              {node.flag}
            </span>
          )}
          {node.name}
        </span>
        <Etch>{node.region || node.group || node.taskName || '—'}</Etch>
      </div>
    </div>
  )
}

function NodeInsightList({
  rows,
  title,
}: {
  rows: LatencyNodeInsight[]
  title: string
}) {
  const { t } = useI18n()
  return (
    <CardFrame title={title} code={`N · ${String(rows.length).padStart(2, '0')}`} inset>
      {rows.length === 0 ? (
        <EmptyState>{t('common.empty')}</EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map((node, index) => (
            <a
              key={node.uuid}
              href={hashFor({ name: 'nodes', uuid: node.uuid })}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) 86px',
                gap: 10,
                alignItems: 'center',
                padding: '10px 12px',
                borderBottom: index < rows.length - 1 ? '1px solid var(--edge-engrave)' : 'none',
                color: 'inherit',
                textDecoration: 'none',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <StatusDot status={latencyTone(node.status)} size={6} />
                  <span
                    style={{
                      fontSize: contentFs(12),
                      fontWeight: 550,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {node.name}
                  </span>
                </div>
                <Etch>
                  {statusLabel(node.status, t)} · P95 {formatLatencyMs(node.p95)} · {formatPercent(node.loss)}
                </Etch>
              </div>
              <Sparkline data={node.spark} width={86} height={26} color={node.status === 'bad' ? 'var(--signal-bad)' : node.status === 'warn' ? 'var(--signal-warn)' : 'var(--accent)'} />
            </a>
          ))}
        </div>
      )}
    </CardFrame>
  )
}

function TargetPanel({ targets }: { targets: LatencyTargetInsight[] }) {
  const { t } = useI18n()
  return (
    <CardFrame title={t('pages.latency.targets')} code={`T · ${String(targets.length).padStart(2, '0')}`} inset>
      {targets.length === 0 ? (
        <EmptyState>{t('pages.latency.noTargets')}</EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {targets.map((target, index) => (
            <div
              key={target.id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) 70px 58px',
                gap: 8,
                alignItems: 'center',
                padding: '10px 12px',
                borderBottom: index < targets.length - 1 ? '1px solid var(--edge-engrave)' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <StatusDot status={latencyTone(target.status)} size={6} />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: contentFs(12),
                      fontWeight: 550,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={target.name}
                  >
                    {target.name}
                  </div>
                  <Etch>{t('pages.latency.targetNodes', { count: target.nodes })}</Etch>
                </div>
              </div>
              <span className="mono tnum" style={{ textAlign: 'right', color: 'var(--fg-0)', fontSize: contentFs(12) }}>
                {formatLatencyMs(target.p95 ?? target.avg)}
              </span>
              <span className="mono tnum" style={{ textAlign: 'right', color: target.loss >= 1 ? 'var(--signal-warn)' : 'var(--fg-2)', fontSize: contentFs(11) }}>
                {formatPercent(target.loss)}
              </span>
            </div>
          ))}
        </div>
      )}
    </CardFrame>
  )
}

function LatencyTable({
  rows,
  nodeMap,
}: {
  rows: LatencyNodeInsight[]
  nodeMap: Map<string, KomariNode>
}) {
  const { t } = useI18n()
  if (rows.length === 0) {
    return (
      <CardFrame title={t('pages.latency.nodeDetails')} code="D · 00">
        <EmptyState>{t('common.empty')}</EmptyState>
      </CardFrame>
    )
  }
  return (
    <CardFrame title={t('pages.latency.nodeDetails')} code={`D · ${String(rows.length).padStart(2, '0')}`} inset>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 980 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '32px minmax(170px, 1.4fr) 92px repeat(6, 92px) minmax(130px, 1fr)',
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
            <span>{t('common.node')}</span>
            <span>{t('common.region')}</span>
            <span style={{ textAlign: 'right' }}>{t('pages.latency.realtime')}</span>
            <span style={{ textAlign: 'right' }}>{t('pages.latency.average')}</span>
            <span style={{ textAlign: 'right' }}>P50</span>
            <span style={{ textAlign: 'right' }}>P95</span>
            <span style={{ textAlign: 'right' }}>{t('pages.latency.max')}</span>
            <span style={{ textAlign: 'right' }}>{t('pages.latency.loss')}</span>
            <span>{t('pages.latency.task')}</span>
          </div>
          {rows.map((node, index) => {
            const source = nodeMap.get(node.uuid)
            return (
              <a
                key={node.uuid}
                href={hashFor({ name: 'nodes', uuid: node.uuid })}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '32px minmax(170px, 1.4fr) 92px repeat(6, 92px) minmax(130px, 1fr)',
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
                <NodeLabel node={node} />
                <span>
                  <SerialPlate>{source?.region || node.region || '—'}</SerialPlate>
                </span>
                <MetricCell value={formatLatencyMs(node.latest)} status={node.status} />
                <MetricCell value={formatLatencyMs(node.avg)} status={node.status} />
                <MetricCell value={formatLatencyMs(node.p50)} status={node.status} />
                <MetricCell value={formatLatencyMs(node.p95)} status={node.status} />
                <MetricCell value={formatLatencyMs(node.max)} status={node.status} />
                <MetricCell value={formatPercent(node.loss)} status={node.loss >= 1 ? 'warn' : 'good'} />
                <span style={{ minWidth: 0 }}>
                  <Etch>{node.taskName || '—'}</Etch>
                </span>
              </a>
            )
          })}
        </div>
      </div>
    </CardFrame>
  )
}

function MetricCell({
  value,
  status,
}: {
  value: string
  status: LatencyStatus | 'good' | 'warn' | 'bad'
}) {
  const color =
    status === 'bad'
      ? 'var(--signal-bad)'
      : status === 'warn'
        ? 'var(--signal-warn)'
        : status === 'empty'
          ? 'var(--fg-3)'
          : 'var(--fg-0)'
  return (
    <span className="mono tnum" style={{ textAlign: 'right', color, fontSize: contentFs(12) }}>
      {value}
    </span>
  )
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
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
      {children}
    </div>
  )
}
