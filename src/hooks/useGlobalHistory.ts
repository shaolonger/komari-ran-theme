import { useEffect, useState } from 'react'
import { fetchNodeLoadHistory, fetchNodePingHistory, type LoadHistory, type PingHistory, type PingTask, type PingRecord } from '@/api/client'
import { bucketLoadHistory } from '@/utils/load'

/**
 * useGlobalHistory — fetches per-node load history for ALL probes (in parallel,
 * concurrency-capped) plus the global ping history once, and exposes:
 *
 *   - byNode: map uuid → bucketed series (60 slots over `windowMs`)
 *   - aggregate: summed network in/out + averaged cpu/ram/disk across all nodes
 *   - ping: raw global ping history (for components that want by-target slicing)
 *   - loading: true while initial fetch is in flight
 *
 * Refreshes every `refreshMs` (default 60s). Only re-fires the fetch when the set
 * of node uuids changes (sorted+joined as cache key) or window changes.
 *
 * Concurrency: max CONCURRENCY simultaneous /api/records/load calls — Komari can
 * handle a few but not 50 at once.
 */

const CONCURRENCY = 6
const BUCKETS = 60

export interface PerNodeSeries {
  cpu: number[]
  ram: number[]
  disk: number[]
  netIn: number[]
  netOut: number[]
  load: number[]
}

export interface AggregateSeries {
  /** Summed net_in across all nodes per bucket (bytes/s) */
  netIn: number[]
  /** Summed net_out across all nodes per bucket (bytes/s) */
  netOut: number[]
  /** Mean cpu % across reporting nodes per bucket */
  cpuMean: number[]
  /** Mean ram % across reporting nodes per bucket */
  ramMean: number[]
  /** Number of nodes that reported data per bucket */
  nodeCount: number[]
}

/** Per-node ping summary derived from the primary (lowest-id) ping task. */
export interface PingNodeStats {
  /** Average latency (ms) of the primary task across the queried window. */
  avg?: number
  /** Loss percent (0..100) of the primary task across the queried window. */
  loss: number
  /** Display name of the primary task (for tooltips / debug). */
  taskName?: string
}

export interface GlobalHistoryState {
  byNode: Record<string, PerNodeSeries>
  /** Per-node ping series — bucketed mean latency over windowMs (60 slots). */
  pingByNode: Record<string, number[]>
  /**
   * Per-node per-bucket packet-loss percent (0..100), aligned 1:1 with
   * pingByNode buckets. Derived from sample-count vs. expected-count
   * (bucketMs / probe interval). -1 means "interval unknown / can't compute".
   */
  pingLossByNode: Record<string, number[]>
  /** Per-node ping stats — current latency + loss percent. */
  pingStatsByNode: Record<string, PingNodeStats>
  aggregate: AggregateSeries
  ping: PingHistory
  loading: boolean
}

const EMPTY_PING: PingHistory = { count: 0, tasks: [], records: [] }

function emptyAggregate(): AggregateSeries {
  return {
    netIn: new Array(BUCKETS).fill(0),
    netOut: new Array(BUCKETS).fill(0),
    cpuMean: new Array(BUCKETS).fill(0),
    ramMean: new Array(BUCKETS).fill(0),
    nodeCount: new Array(BUCKETS).fill(0),
  }
}

/** Run async work in batches of `limit` to cap concurrency. */
async function pmap<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  limit: number,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      out[i] = await worker(items[i])
    }
  })
  await Promise.all(runners)
  return out
}

export function useGlobalHistory(
  uuids: string[],
  hours = 1,
  refreshMs = 60_000,
  /**
   * When false, the hook is paused — it doesn't fetch and returns an
   * empty state. Lets callers conditionally fire a hook based on UI
   * state (e.g. only pull 30d data when the user actually zooms to 30d).
   */
  enabled = true,
): GlobalHistoryState {
  const [state, setState] = useState<GlobalHistoryState>({
    byNode: {},
    pingByNode: {},
    pingLossByNode: {},
    pingStatsByNode: {},
    aggregate: emptyAggregate(),
    ping: EMPTY_PING,
    loading: true,
  })

  // Stable cache key — same uuids in any order should hit cache the same way.
  const key = [...uuids].sort().join(',') + `|h=${hours}`

  useEffect(() => {
    if (!enabled) {
      setState({
        byNode: {},
        pingByNode: {},
        pingLossByNode: {},
        pingStatsByNode: {},
        aggregate: emptyAggregate(),
        ping: EMPTY_PING,
        loading: false,
      })
      return
    }
    if (uuids.length === 0) {
      setState({
        byNode: {},
        pingByNode: {},
        pingLossByNode: {},
        pingStatsByNode: {},
        aggregate: emptyAggregate(),
        ping: EMPTY_PING,
        loading: false,
      })
      return
    }
    let cancelled = false

    const refresh = async () => {
      const windowMs = hours * 60 * 60 * 1000

      // Fan out load + ping per-node in parallel. Komari's global
      // /api/records/ping?hours=N (no uuid) is unreliable on many deployments —
      // it omits the `tasks` array, so the dashboard never gets target metadata.
      // Per-node ping (uuid filter) always returns both tasks and records, so we
      // fetch each node's ping and merge them.
      const histories = await pmap(
        uuids,
        async (
          uuid,
        ): Promise<{ uuid: string; load: LoadHistory; ping: PingHistory }> => {
          const [load, ping] = await Promise.all([
            fetchNodeLoadHistory(uuid, hours).catch(() => ({ count: 0, records: [] }) as LoadHistory),
            fetchNodePingHistory(uuid, hours).catch(
              () => ({ count: 0, tasks: [], records: [] }) as PingHistory,
            ),
          ])
          return { uuid, load, ping }
        },
        CONCURRENCY,
      )

      if (cancelled) return

      const byNode: Record<string, PerNodeSeries> = {}
      const agg = emptyAggregate()
      // For mean calculation we accumulate sums + per-bucket counts of reporting nodes.
      const cpuSum = new Array(BUCKETS).fill(0)
      const ramSum = new Array(BUCKETS).fill(0)
      const cpuCount = new Array(BUCKETS).fill(0)
      const ramCount = new Array(BUCKETS).fill(0)

      for (const { uuid, load } of histories) {
        const series = bucketLoadHistory(load, BUCKETS, windowMs)
        byNode[uuid] = series

        for (let i = 0; i < BUCKETS; i++) {
          if (series.netIn[i] > 0 || series.netOut[i] > 0 || series.cpu[i] > 0) {
            agg.netIn[i] += series.netIn[i]
            agg.netOut[i] += series.netOut[i]
            agg.nodeCount[i] += 1
            if (series.cpu[i] > 0) {
              cpuSum[i] += series.cpu[i]
              cpuCount[i] += 1
            }
            if (series.ram[i] > 0) {
              ramSum[i] += series.ram[i]
              ramCount[i] += 1
            }
          }
        }
      }

      for (let i = 0; i < BUCKETS; i++) {
        agg.cpuMean[i] = cpuCount[i] > 0 ? cpuSum[i] / cpuCount[i] : 0
        agg.ramMean[i] = ramCount[i] > 0 ? ramSum[i] / ramCount[i] : 0
      }

      // Merge per-node ping into a single PingHistory + per-node ms series.
      // Strategy: pick the "primary" task per node — the task with the lowest
      // id (= earliest created in Komari admin = first row in the latency
      // monitor list) — and surface its backend-computed avg/loss as the
      // node's headline latency/loss readout. The sparkline is filtered to
      // the same primary task so the bar chart and the headline number agree.
      // Other tasks are still preserved in the merged PingHistory so
      // NodeDetail can plot all targets separately.
      const tasksById = new Map<number, PingTask>()
      const allRecords: PingRecord[] = []
      const pingByNode: Record<string, number[]> = {}
      const pingLossByNode: Record<string, number[]> = {}
      const pingStatsByNode: Record<string, PingNodeStats> = {}
      const now = Date.now()
      const start = now - windowMs
      const bucketMs = windowMs / BUCKETS
      // The ping/loss meter wants to show SHORT-TERM fluctuation, not a long
      // smoothed average. With a 30s probe interval, a 30-min window over 60
      // buckets gives ~1 sample/bucket — effectively per-probe resolution, so
      // spikes and per-minute loss show up instead of being averaged away.
      // Decoupled from windowMs so cpu/ram/traffic charts keep their range.
      const PING_WINDOW_MS = 30 * 60 * 1000
      const pingWindowMs = Math.min(windowMs, PING_WINDOW_MS)
      const pingStart = now - pingWindowMs
      const pingBucketMs = pingWindowMs / BUCKETS
      for (const { uuid, ping } of histories) {
        for (const t of ping.tasks ?? []) {
          if (!tasksById.has(t.id)) tasksById.set(t.id, t)
        }

        // Pick this node's primary target — lowest-id task that this node
        // actually has data for (samples present in the window).
        const tasksSorted = [...(ping.tasks ?? [])].sort((a, b) => a.id - b.id)
        const primary = tasksSorted[0]
        const primaryId = primary?.id

        // Build a sparkline from primary-task records only.
        const sum = new Array(BUCKETS).fill(0)
        const cnt = new Array(BUCKETS).fill(0)
        for (const r of ping.records ?? []) {
          // Stamp client onto the merged record so the global view can split by node.
          allRecords.push({ ...r, client: r.client ?? uuid })
          if (primaryId == null || r.task_id !== primaryId) continue
          const tsec = new Date(r.time).getTime()
          if (!Number.isFinite(tsec) || tsec < pingStart) continue
          const idx = Math.min(BUCKETS - 1, Math.max(0, Math.floor((tsec - pingStart) / pingBucketMs)))
          // Treat 0/negative ping (timeout/error sentinel) as no-data; otherwise
          // it drags the mean toward 0 and the sparkline lies.
          if (r.value > 0) {
            sum[idx] += r.value
            cnt[idx] += 1
          }
        }
        pingByNode[uuid] = sum.map((s, i) => (cnt[i] > 0 ? s / cnt[i] : 0))

        // Per-bucket packet loss %, reverse-derived from sample density:
        //   expected samples per bucket = bucketMs / (interval * 1000)
        //   loss% = (1 - actual/expected) * 100
        // CRITICAL: buckets *outside* the node's actual data span (before its
        // first sample, or after its last — e.g. the current still-filling
        // bucket) must NOT count as loss. Those are "no data yet", not a
        // dropped probe. We mark them -1 so the meter renders them empty
        // instead of a false full-loss bar. Only GAPS *between* real samples
        // are genuine packet loss.
        const intervalSec =
          primary && typeof primary.interval === 'number' && primary.interval > 0
            ? primary.interval
            : 0
        const expectedPerBucket = intervalSec > 0 ? pingBucketMs / (intervalSec * 1000) : 0
        // Find the data span [firstIdx, lastIdx] where this node actually
        // reported samples within the window.
        let firstIdx = -1
        let lastIdx = -1
        for (let i = 0; i < BUCKETS; i++) {
          if (cnt[i] > 0) {
            if (firstIdx === -1) firstIdx = i
            lastIdx = i
          }
        }
        pingLossByNode[uuid] = cnt.map((c, i) => {
          // Outside the real data span → no data, not loss.
          if (firstIdx === -1 || i < firstIdx || i > lastIdx) return -1
          if (expectedPerBucket <= 0) {
            // interval unknown → binary: any sample = up (0%), none = full loss
            return c > 0 ? 0 : 100
          }
          const expected = Math.max(1, expectedPerBucket)
          const ratio = c / expected
          return Math.max(0, Math.min(100, (1 - ratio) * 100))
        })

        // Headline number: trust backend's avg/loss for the primary task.
        // These are pre-computed per node per task across the queried window,
        // so they're accurate and free.
        if (primary) {
          pingStatsByNode[uuid] = {
            avg: typeof primary.avg === 'number' ? primary.avg : undefined,
            loss: typeof primary.loss === 'number' ? primary.loss : 0,
            taskName: primary.name,
          }
        } else {
          pingStatsByNode[uuid] = { loss: 0 }
        }
      }
      const ping: PingHistory = {
        count: allRecords.length,
        tasks: Array.from(tasksById.values()).sort((a, b) => a.id - b.id),
        records: allRecords,
      }

      setState({ byNode, pingByNode, pingLossByNode, pingStatsByNode, aggregate: agg, ping, loading: false })
    }

    setState((prev) => ({ ...prev, loading: prev.loading || Object.keys(prev.byNode).length === 0 }))
    refresh()
    const t = setInterval(refresh, refreshMs)

    return () => {
      cancelled = true
      clearInterval(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshMs, enabled])

  return state
}
