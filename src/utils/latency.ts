import type { PingHistory, PingRecord, PingTask } from '@/api/client'
import type { KomariNode, KomariRecord } from '@/types/komari'

export type LatencyStatus = 'good' | 'warn' | 'bad' | 'empty'

export interface LatencyBucket {
  avg: number
  loss: number
  samples: number
}

export interface LatencyNodeInsight {
  uuid: string
  name: string
  region?: string
  group?: string
  flag?: string
  online: boolean
  latest?: number
  avg?: number
  p50?: number
  p95?: number
  max?: number
  loss: number
  jitter?: number
  samples: number
  lastSample?: string
  taskName?: string
  status: LatencyStatus
  buckets: LatencyBucket[]
  spark: number[]
}

export interface LatencyTargetInsight {
  id: number
  name: string
  avg?: number
  p95?: number
  loss: number
  samples: number
  nodes: number
  worstNode?: string
  status: LatencyStatus
}

export interface LatencyFleetSummary {
  avg?: number
  p50?: number
  p95?: number
  max?: number
  loss: number
  jitter?: number
  samples: number
  reportingNodes: number
  degradedNodes: number
  offlineNodes: number
  worstNode?: LatencyNodeInsight
  spark: number[]
}

export interface LatencyAnalyticsData {
  summary: LatencyFleetSummary
  nodes: LatencyNodeInsight[]
  targets: LatencyTargetInsight[]
}

const EMPTY_BUCKET: LatencyBucket = { avg: 0, loss: -1, samples: 0 }

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function percentile(values: number[], q: number): number | undefined {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  const next = sorted[base + 1]
  return next === undefined ? sorted[base] : sorted[base] + rest * (next - sorted[base])
}

function average(values: number[]): number | undefined {
  if (values.length === 0) return undefined
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function jitter(values: number[]): number | undefined {
  if (values.length < 2) return undefined
  let total = 0
  for (let i = 1; i < values.length; i++) {
    total += Math.abs(values[i] - values[i - 1])
  }
  return total / (values.length - 1)
}

function latencyStatus(latency: number | undefined, loss: number, online: boolean): LatencyStatus {
  if (!online) return 'bad'
  if (!finitePositive(latency)) return loss > 0 ? 'bad' : 'empty'
  if (loss >= 5 || latency >= 300) return 'bad'
  if (loss >= 1 || latency >= 150) return 'warn'
  return 'good'
}

function mergeStatus(a: LatencyStatus, b: LatencyStatus): LatencyStatus {
  const rank: Record<LatencyStatus, number> = { empty: 0, good: 1, warn: 2, bad: 3 }
  return rank[b] > rank[a] ? b : a
}

function pickPrimaryTask(history: PingHistory): PingTask | undefined {
  const tasks = history.tasks ?? []
  if (tasks.length === 0) return undefined
  const counts = new Map<number, number>()
  for (const record of history.records ?? []) {
    counts.set(record.task_id, (counts.get(record.task_id) ?? 0) + 1)
  }
  return [...tasks].sort((a, b) => {
    const sampleDelta = (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)
    return sampleDelta || a.id - b.id
  })[0]
}

function bucketRecords(
  records: PingRecord[],
  bucketCount: number,
  fromMs: number,
  toMs: number,
  intervalSec?: number,
): LatencyBucket[] {
  const bucketMs = Math.max(1, (toMs - fromMs) / bucketCount)
  const sums = new Array(bucketCount).fill(0)
  const counts = new Array(bucketCount).fill(0)
  const buckets = Array.from({ length: bucketCount }, () => ({ ...EMPTY_BUCKET }))

  for (const record of records) {
    const time = new Date(record.time).getTime()
    if (!Number.isFinite(time) || time < fromMs || time > toMs || !finitePositive(record.value)) {
      continue
    }
    const index = Math.min(bucketCount - 1, Math.max(0, Math.floor((time - fromMs) / bucketMs)))
    sums[index] += record.value
    counts[index] += 1
  }

  let first = -1
  let last = -1
  for (let i = 0; i < bucketCount; i++) {
    if (counts[i] > 0) {
      if (first === -1) first = i
      last = i
    }
  }

  const expectedPerBucket =
    intervalSec && intervalSec > 0 ? Math.max(1, bucketMs / (intervalSec * 1000)) : 0

  for (let i = 0; i < bucketCount; i++) {
    buckets[i].samples = counts[i]
    buckets[i].avg = counts[i] > 0 ? sums[i] / counts[i] : 0
    if (first === -1 || i < first || i > last) {
      buckets[i].loss = -1
    } else if (expectedPerBucket > 0) {
      buckets[i].loss = Math.max(0, Math.min(100, (1 - counts[i] / expectedPerBucket) * 100))
    } else {
      buckets[i].loss = counts[i] > 0 ? 0 : 100
    }
  }

  return buckets
}

export function buildLatencyAnalytics(options: {
  nodes: KomariNode[]
  records: Record<string, KomariRecord>
  histories: Record<string, PingHistory>
  hours: number
  bucketCount?: number
  nowMs?: number
}): LatencyAnalyticsData {
  const bucketCount = options.bucketCount ?? 60
  const nowMs = options.nowMs ?? Date.now()
  const fromMs = nowMs - options.hours * 60 * 60 * 1000
  const nodeInsights: LatencyNodeInsight[] = []
  const targetValues = new Map<number, {
    task: PingTask
    values: number[]
    nodes: Set<string>
    worst?: { node: string; value: number }
  }>()

  for (const node of options.nodes) {
    const live = options.records[node.uuid]
    const history = options.histories[node.uuid] ?? { count: 0, tasks: [], records: [] }
    const primary = pickPrimaryTask(history)
    const primaryRecords = (history.records ?? [])
      .filter((record) => primary && record.task_id === primary.id)
      .filter((record) => {
        const time = new Date(record.time).getTime()
        return Number.isFinite(time) && time >= fromMs && time <= nowMs
      })
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    const values = primaryRecords
      .map((record) => record.value)
      .filter(finitePositive)
    const latestHistory = [...primaryRecords].reverse().find((record) => finitePositive(record.value))
    const latest =
      finitePositive(live?.ping) ? live.ping : finitePositive(latestHistory?.value) ? latestHistory.value : undefined
    const avg = values.length > 0
      ? average(values)
      : finitePositive(primary?.avg)
        ? primary.avg
        : latest
    const loss = typeof primary?.loss === 'number' && Number.isFinite(primary.loss)
      ? primary.loss
      : typeof live?.loss === 'number' && Number.isFinite(live.loss)
        ? live.loss
        : 0
    const max = values.length > 0 ? Math.max(...values) : latest
    const buckets = bucketRecords(primaryRecords, bucketCount, fromMs, nowMs, primary?.interval)
    const status = latencyStatus(latest ?? avg, loss, live?.online !== false)

    nodeInsights.push({
      uuid: node.uuid,
      name: node.name || node.uuid.slice(0, 8),
      region: node.region,
      group: node.group,
      flag: node.flag,
      online: live?.online !== false,
      latest,
      avg,
      p50: percentile(values, 0.5),
      p95: percentile(values, 0.95),
      max,
      loss,
      jitter: jitter(values),
      samples: values.length,
      lastSample: latestHistory?.time,
      taskName: primary?.name,
      status,
      buckets,
      spark: buckets.map((bucket) => bucket.avg),
    })

    for (const task of history.tasks ?? []) {
      const taskValues = (history.records ?? [])
        .filter((record) => record.task_id === task.id)
        .filter((record) => {
          const time = new Date(record.time).getTime()
          return Number.isFinite(time) && time >= fromMs && time <= nowMs && finitePositive(record.value)
        })
        .map((record) => record.value)
      if (taskValues.length === 0) continue
      const entry = targetValues.get(task.id) ?? {
        task,
        values: [],
        nodes: new Set<string>(),
      }
      entry.values.push(...taskValues)
      entry.nodes.add(node.uuid)
      const taskMax = Math.max(...taskValues)
      if (!entry.worst || taskMax > entry.worst.value) {
        entry.worst = { node: node.name || node.uuid.slice(0, 8), value: taskMax }
      }
      targetValues.set(task.id, entry)
    }
  }

  const reporting = nodeInsights.filter((node) => node.samples > 0 || finitePositive(node.latest))
  const fleetValues = reporting.flatMap((node) =>
    (options.histories[node.uuid]?.records ?? [])
      .filter((record) => finitePositive(record.value))
      .map((record) => record.value),
  )
  const lossNodes = reporting.filter((node) => Number.isFinite(node.loss))
  const loss = lossNodes.length > 0
    ? lossNodes.reduce((sum, node) => sum + node.loss, 0) / lossNodes.length
    : 0
  const fleetBuckets = Array.from({ length: bucketCount }, (_, index) => {
    const values = reporting
      .map((node) => node.buckets[index]?.avg)
      .filter(finitePositive)
    return average(values) ?? 0
  })
  const worstNode = [...nodeInsights]
    .filter((node) => node.status !== 'empty')
    .sort((a, b) => {
      const statusDelta =
        ({ bad: 3, warn: 2, good: 1, empty: 0 }[b.status] ?? 0) -
        ({ bad: 3, warn: 2, good: 1, empty: 0 }[a.status] ?? 0)
      return statusDelta || (b.p95 ?? b.latest ?? 0) - (a.p95 ?? a.latest ?? 0)
    })[0]
  const summary: LatencyFleetSummary = {
    avg: average(fleetValues),
    p50: percentile(fleetValues, 0.5),
    p95: percentile(fleetValues, 0.95),
    max: fleetValues.length > 0 ? Math.max(...fleetValues) : undefined,
    loss,
    jitter: jitter(fleetValues),
    samples: fleetValues.length,
    reportingNodes: reporting.length,
    degradedNodes: nodeInsights.filter((node) => node.status === 'warn' || node.status === 'bad').length,
    offlineNodes: nodeInsights.filter((node) => !node.online).length,
    worstNode,
    spark: fleetBuckets,
  }

  const targets = [...targetValues.entries()]
    .map(([id, entry]) => {
      const avg = average(entry.values)
      const p95 = percentile(entry.values, 0.95)
      const loss = typeof entry.task.loss === 'number' && Number.isFinite(entry.task.loss)
        ? entry.task.loss
        : 0
      let status: LatencyStatus = 'empty'
      for (const value of entry.values) {
        status = mergeStatus(status, latencyStatus(value, loss, true))
      }
      return {
        id,
        name: entry.task.name || `#${id}`,
        avg,
        p95,
        loss,
        samples: entry.values.length,
        nodes: entry.nodes.size,
        worstNode: entry.worst?.node,
        status,
      }
    })
    .sort((a, b) => (b.p95 ?? b.avg ?? 0) - (a.p95 ?? a.avg ?? 0))

  return {
    summary,
    nodes: nodeInsights,
    targets,
  }
}

export function formatLatencyMs(value: number | undefined, digits = 0): string {
  if (!finitePositive(value)) return '—'
  return `${value.toFixed(value >= 100 ? 0 : digits)} ms`
}

export function latencyTone(status: LatencyStatus): 'good' | 'warn' | 'bad' {
  if (status === 'good') return 'good'
  if (status === 'warn' || status === 'empty') return 'warn'
  return 'bad'
}
