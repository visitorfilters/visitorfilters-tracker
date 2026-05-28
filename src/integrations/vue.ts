import { ref, onMounted, watch } from 'vue'
import type { App, Ref } from 'vue'
import { init, track, identify, flush } from '../index'
import type { TrackerConfig, TrackerInstance } from '../types'

export interface UseVisitorFilterReturn {
  track: (eventType: string, payload?: Record<string, unknown>) => void
  identify: (traits: Record<string, unknown>) => void
  flush: () => Promise<void>
  instance: Ref<TrackerInstance | null>
  isReady: Ref<boolean>
}

/**
 * Vue 3 composable for VisitorFilters tracker.
 *
 * ```ts
 * // main.ts
 * import { createApp } from 'vue'
 * import { VisitorFiltersPlugin } from '@visitorfilters/tracker/vue'
 *
 * createApp(App)
 *   .use(VisitorFiltersPlugin, { siteKey: 'vf_live_xxx' })
 *   .mount('#app')
 * ```
 *
 * ```ts
 * // In a component
 * import { useVisitorFilters } from '@visitorfilters/tracker/vue'
 *
 * const { track } = useVisitorFilters()
 * track('button_click', { label: 'Subscribe' })
 * ```
 */

const _config = ref<TrackerConfig | null>(null)
const _instance = ref<TrackerInstance | null>(null)
const _isReady = ref(false)

export const useVisitorFilter = (): UseVisitorFilterReturn => {
  return {
    track: (eventType, payload) => track(eventType, payload),
    identify: (traits) => identify(traits),
    flush: () => flush(),
    instance: _instance as Ref<TrackerInstance | null>,
    isReady: _isReady,
  }
}

export const useVisitorFilters = useVisitorFilter

/**
 * Vue Router composable - automatically tracks page views on navigation.
 *
 * ```ts
 * import { useRouteTracking } from '@visitorfilters/tracker/vue'
 * import { useRoute } from 'vue-router'
 *
 * const route = useRoute()
 * useRouteTracking(route)
 * ```
 */
export const useRouteTracking = (route: { path: string }): void => {
  watch(
    () => route.path,
    (path: string, prev: string) => {
      if (path !== prev) {
        track('pageview', { path })
      }
    },
  )
}

/**
 * Vue plugin - installs VisitorFilters globally.
 */
export const VisitorFilterPlugin = {
  install(app: App, config: TrackerConfig): void {
    _config.value = config

    onMounted(() => {
      init(config).then((instance) => {
        _instance.value = instance
        _isReady.value = true
      })
    })

    app.config.globalProperties.$vf = {
      track: (eventType: string, payload?: Record<string, unknown>) => track(eventType, payload),
      identify: (traits: Record<string, unknown>) => identify(traits),
    }
  },
}

export const VisitorFiltersPlugin = VisitorFilterPlugin
