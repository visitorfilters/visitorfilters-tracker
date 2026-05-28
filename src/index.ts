import { createCollector } from './core/collector'
import type { TrackerConfig, TrackerInstance } from './types'

export type { TrackerConfig, TrackerInstance, TrackEvent, PolicyResponse } from './types'

let _instance: TrackerInstance | null = null
let _initPromise: Promise<TrackerInstance> | null = null

/**
 * Initialize the VisitorFilters tracker.
 *
 * ```ts
 * import { init, track } from '@visitorfilters/tracker'
 *
 * await init({ siteKey: 'vf_live_xxx' })
 * track('button_click', { label: 'Get Started' })
 * ```
 */
export const init = (config: TrackerConfig): Promise<TrackerInstance> => {
  if (_initPromise) return _initPromise

  _initPromise = createCollector(config).then((instance) => {
    _instance = instance
    return instance
  })

  return _initPromise
}

/**
 * Track a custom event.
 * Safe to call before `init()` resolves - events are queued.
 */
export const track = (eventType: string, payload?: Record<string, unknown>): void => {
  if (_instance) {
    _instance.track(eventType, payload)
    return
  }
  // Queue until ready
  _initPromise?.then((i) => i.track(eventType, payload))
}

/**
 * Identify the current user with custom traits.
 */
export const identify = (traits: Record<string, unknown>): void => {
  if (_instance) {
    _instance.identify(traits)
    return
  }
  _initPromise?.then((i) => i.identify(traits))
}

/**
 * Flush buffered events immediately.
 */
export const flush = (): Promise<void> => {
  return _instance?.flush() ?? Promise.resolve()
}

/**
 * Get the current tracker instance (after init).
 */
export const getInstance = (): TrackerInstance | null => _instance
