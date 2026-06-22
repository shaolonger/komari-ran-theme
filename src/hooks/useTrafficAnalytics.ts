import { useEffect, useState } from 'react'
import {
  fetchTrafficRange,
  trafficTimezone,
  type TrafficRangeGroupBy,
  type TrafficRangeParams,
  type TrafficRangePreset,
  type TrafficRangeResponse,
  type TrafficSummary,
} from '@/api/client'

const EMPTY_SUMMARY: TrafficSummary = {
  up: 0,
  down: 0,
  total: 0,
  avg_bps: 0,
  peak_bps: 0,
  nodes: 0,
  samples: 0,
  coverage: 0,
  resets: 0,
  estimated: false,
  quality: 'empty',
}

function emptyTrafficRange(params: TrafficRangeParams): TrafficRangeResponse {
  const now = new Date().toISOString()
  return {
    from: typeof params.from === 'string' ? params.from : params.from?.toISOString() ?? now,
    to: typeof params.to === 'string' ? params.to : params.to?.toISOString() ?? now,
    timezone: params.timezone ?? trafficTimezone() ?? 'UTC',
    group_by: params.groupBy === 'day' ? 'day' : params.groupBy === 'none' ? 'none' : 'hour',
    bucket_size_seconds: params.groupBy === 'day' ? 86400 : params.groupBy === 'none' ? 0 : 3600,
    summary: EMPTY_SUMMARY,
    nodes: [],
    series: [],
  }
}

function stableTrafficKey(params: TrafficRangeParams): string {
  return JSON.stringify({
    preset: params.preset,
    from: params.from instanceof Date ? params.from.toISOString() : params.from,
    to: params.to instanceof Date ? params.to.toISOString() : params.to,
    uuids: [...(params.uuids ?? [])].sort(),
    timezone: params.timezone,
    groupBy: params.groupBy,
    includeNodeSeries: params.includeNodeSeries,
  })
}

export interface UseTrafficAnalyticsOptions {
  preset?: TrafficRangePreset
  from?: Date | string
  to?: Date | string
  uuids?: string[]
  timezone?: string
  groupBy?: TrafficRangeGroupBy
  includeNodeSeries?: boolean
  enabled?: boolean
  refreshMs?: number
}

export interface UseTrafficAnalyticsState {
  data: TrafficRangeResponse
  loading: boolean
  error?: string
  refetch: () => void
}

export function useTrafficAnalytics(options: UseTrafficAnalyticsOptions): UseTrafficAnalyticsState {
  const params: TrafficRangeParams = {
    preset: options.preset,
    from: options.from,
    to: options.to,
    uuids: options.uuids,
    timezone: options.timezone ?? trafficTimezone(),
    groupBy: options.groupBy ?? 'auto',
    includeNodeSeries: options.includeNodeSeries,
  }
  const enabled = options.enabled ?? true
  const refreshMs = options.refreshMs ?? 60_000
  const [reloadToken, setReloadToken] = useState(0)
  const [state, setState] = useState<Omit<UseTrafficAnalyticsState, 'refetch'>>({
    data: emptyTrafficRange(params),
    loading: enabled,
  })
  const key = stableTrafficKey(params)

  useEffect(() => {
    if (!enabled) {
      let cancelled = false
      queueMicrotask(() => {
        if (!cancelled) setState({ data: emptyTrafficRange(params), loading: false })
      })
      return () => {
        cancelled = true
      }
    }

    let cancelled = false

    const load = async (showLoading: boolean) => {
      if (showLoading) {
        setState((prev) => ({ ...prev, loading: true, error: undefined }))
      }
      try {
        const data = await fetchTrafficRange(params)
        if (!cancelled) setState({ data, loading: false })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load traffic analytics'
        if (!cancelled) {
          setState({ data: emptyTrafficRange(params), loading: false, error: message })
        }
      }
    }

    load(true)
    const timer = refreshMs > 0 ? window.setInterval(() => load(false), refreshMs) : undefined
    return () => {
      cancelled = true
      if (timer) window.clearInterval(timer)
    }
    // The stable key intentionally captures the params object shape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, refreshMs, reloadToken])

  return {
    ...state,
    refetch: () => setReloadToken((v) => v + 1),
  }
}
