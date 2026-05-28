import { useEffect, useRef, useCallback } from 'react'
import { init, track, identify, flush } from '../index'
import type { TrackerConfig, TrackerInstance } from '../types'

export interface UseVisitorFilterOptions extends TrackerConfig {}

export interface UseVisitorFilterReturn {
  track: (eventType: string, payload?: Record<string, unknown>) => void
  identify: (traits: Record<string, unknown>) => void
  flush: () => Promise<void>
  instance: TrackerInstance | null
}

/**
 * React hook for VisitorFilters tracker.
 *
 * ```tsx
 * import { useVisitorFilters } from '@visitorfilters/tracker/react'
 *
 * function App() {
 *   const { track } = useVisitorFilters({ siteKey: 'vf_live_xxx' })
 *
 *   return (
 *     <button onClick={() => track('cta_click', { label: 'Start Free Trial' })}>
 *       Start Free Trial
 *     </button>
 *   )
 * }
 * ```
 */
export const useVisitorFilter = (options: UseVisitorFilterOptions): UseVisitorFilterReturn => {
  const instanceRef = useRef<TrackerInstance | null>(null)

  useEffect(() => {
    init(options).then((instance) => {
      instanceRef.current = instance
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.siteKey])

  const trackFn = useCallback(
    (eventType: string, payload?: Record<string, unknown>) => track(eventType, payload),
    [],
  )

  const identifyFn = useCallback((traits: Record<string, unknown>) => identify(traits), [])

  const flushFn = useCallback(() => flush(), [])

  return {
    track: trackFn,
    identify: identifyFn,
    flush: flushFn,
    instance: instanceRef.current,
  }
}

export const useVisitorFilters = useVisitorFilter

/**
 * Track a page view on route change (for React Router / Next.js App Router).
 *
 * ```tsx
 * import { usePageView } from '@visitorfilters/tracker/react'
 * import { usePathname } from 'next/navigation'
 *
 * function AnalyticsProvider() {
 *   const pathname = usePathname()
 *   usePageView(pathname)
 *   return null
 * }
 * ```
 */
export const usePageView = (pathname: string): void => {
  const previousPath = useRef<string | null>(null)

  useEffect(() => {
    if (previousPath.current !== null && previousPath.current !== pathname) {
      track('pageview', { path: pathname })
    }
    previousPath.current = pathname
  }, [pathname])
}
