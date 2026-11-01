import { computed, onUnmounted, ref, watch } from 'vue'
import { getDocumentStats, type DocumentStats, type StatsGranularity, type StatsRange } from '../../api/documents'
import { useAuthStore } from '../../stores/auth'
import { buildSampleStats } from './sampleStats'
import { describeStatsError, type StatsNotice } from './statsFormat'
import { normalizeDocumentStats, statsCacheKey } from './statsNormalize'

const cache = new Map<string, DocumentStats>()

export function useWorkspaceStats() {
  const auth = useAuthStore()
  const range = ref<StatsRange>('30d')
  const granularity = ref<StatsGranularity>('day')
  const chartMode = ref<'line' | 'bar'>('line')
  const stats = ref<DocumentStats | null>(null)
  const loading = ref(false)
  const refreshing = ref(false)
  const error = ref<StatsNotice | null>(null)
  let generation = 0
  let controller: AbortController | null = null
  let alive = true

  const sample = computed(() => buildSampleStats(range.value, granularity.value))
  const showingSample = computed(() => !auth.isAuthenticated)
  const view = computed(() => (showingSample.value ? sample.value : stats.value))

  function userKey(): string {
    return auth.user?.id || 'anonymous'
  }

  async function load(fresh = false) {
    if (!auth.isAuthenticated) {
      stats.value = null
      error.value = null
      loading.value = false
      refreshing.value = false
      return
    }
    const key = statsCacheKey(userKey(), range.value, granularity.value)
    if (!fresh) {
      const cached = cache.get(key)
      if (cached) stats.value = cached
    } else {
      cache.delete(key)
    }
    const gen = ++generation
    controller?.abort()
    const next = new AbortController()
    controller = next
    const hasData = Boolean(stats.value)
    loading.value = !hasData
    refreshing.value = hasData
    error.value = null
    try {
      const res = await getDocumentStats(
        { range: range.value, granularity: granularity.value },
        { fresh, signal: next.signal },
      )
      if (!alive || gen !== generation || !auth.isAuthenticated) return
      const safe = normalizeDocumentStats(res)
      cache.set(key, safe)
      stats.value = safe
    } catch (e) {
      if (!alive || gen !== generation) return
      if (e instanceof DOMException && e.name === 'AbortError') return
      error.value = describeStatsError(e)
    } finally {
      if (alive && gen === generation) {
        loading.value = false
        refreshing.value = false
      }
    }
  }

  watch([range, granularity], () => {
    if (auth.isAuthenticated) void load(false)
  })

  watch(
    () => auth.isAuthenticated,
    (ok) => {
      generation += 1
      controller?.abort()
      cache.clear()
      stats.value = null
      loading.value = false
      refreshing.value = false
      if (!ok) {
        if (error.value?.kind !== 'auth') error.value = null
        return
      }
      error.value = null
      void load(true)
    },
  )

  onUnmounted(() => {
    alive = false
    controller?.abort()
  })

  return {
    auth,
    range,
    granularity,
    chartMode,
    stats,
    loading,
    refreshing,
    error,
    sample,
    showingSample,
    view,
    load,
  }
}
