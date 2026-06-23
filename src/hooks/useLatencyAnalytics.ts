import { useEffect, useMemo, useState } from 'react'
import { fetchNodePingHistory, type PingHistory } from '@/api/client'
import type { KomariNode, KomariRecord } from '@/types/komari'
import { buildLatencyAnalytics, type LatencyAnalyticsData } from '@/utils/latency'

const CONCURRENCY = 6
const EMPTY_PING: PingHistory = { count: 0, tasks: [], records: [] }

async function pmap<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  limit: number,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      out[index] = await worker(items[index])
    }
  })
  await Promise.all(runners)
  return out
}

function emptyData(nodes: KomariNode[], records: Record<string, KomariRecord>, hours: number): LatencyAnalyticsData {
  return buildLatencyAnalytics({
    nodes,
    records,
    histories: {},
    hours,
  })
}

export interface UseLatencyAnalyticsOptions {
  nodes: KomariNode[]
  records: Record<string, KomariRecord>
  hours: number
  enabled?: boolean
  refreshMs?: number
}

export interface UseLatencyAnalyticsState {
  data: LatencyAnalyticsData
  loading: boolean
  error?: string
  refetch: () => void
}

export function useLatencyAnalytics(options: UseLatencyAnalyticsOptions): UseLatencyAnalyticsState {
  const { nodes, records, hours } = options
  const enabled = options.enabled ?? true
  const refreshMs = options.refreshMs ?? 60_000
  const uuids = useMemo(() => nodes.map((node) => node.uuid), [nodes])
  const key = useMemo(() => [...uuids].sort().join(',') + `|h=${hours}`, [hours, uuids])
  const [reloadToken, setReloadToken] = useState(0)
  const [histories, setHistories] = useState<Record<string, PingHistory>>({})
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    if (!enabled || uuids.length === 0) {
      let cancelled = false
      queueMicrotask(() => {
        if (cancelled) return
        setHistories({})
        setLoading(false)
        setError(undefined)
      })
      return () => {
        cancelled = true
      }
    }

    let cancelled = false

    const load = async (showLoading: boolean) => {
      if (showLoading) {
        setLoading(true)
        setError(undefined)
      }
      try {
        const results = await pmap(
          uuids,
          async (uuid): Promise<[string, PingHistory]> => {
            const history = await fetchNodePingHistory(uuid, hours).catch(() => EMPTY_PING)
            return [uuid, history]
          },
          CONCURRENCY,
        )
        if (cancelled) return
        setHistories(Object.fromEntries(results))
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setHistories({})
        setError(err instanceof Error ? err.message : 'Failed to load latency analytics')
        setLoading(false)
      }
    }

    load(true)
    const timer = refreshMs > 0 ? window.setInterval(() => load(false), refreshMs) : undefined
    return () => {
      cancelled = true
      if (timer) window.clearInterval(timer)
    }
  }, [enabled, hours, key, refreshMs, reloadToken, uuids])

  const data = useMemo(() => {
    if (!enabled) return emptyData(nodes, records, hours)
    return buildLatencyAnalytics({
      nodes,
      records,
      histories,
      hours,
    })
  }, [enabled, histories, hours, nodes, records])

  return {
    data,
    loading,
    error,
    refetch: () => setReloadToken((value) => value + 1),
  }
}
