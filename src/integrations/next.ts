'use client'

import { useEffect } from 'react'
import { init, track } from '../index'
import type { TrackerConfig } from '../types'

export type { UseVisitorFilterReturn, UseVisitorFilterOptions } from './react'
export { useVisitorFilter, useVisitorFilters, usePageView } from './react'

export interface VisitorFilterScriptProps extends TrackerConfig {
  /** Called once the tracker is initialized */
  onReady?: () => void
}

export type VisitorFiltersScriptProps = VisitorFilterScriptProps

/**
 * Next.js App Router component - place in your root layout.
 *
 * ```tsx
 * // app/layout.tsx
 * import { VisitorFiltersScript } from '@visitorfilters/tracker/next'
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         {children}
 *         <VisitorFiltersScript siteKey="vf_live_xxx" />
 *       </body>
 *     </html>
 *   )
 * }
 * ```
 */
export const VisitorFilterScript = ({
  onReady,
  ...config
}: VisitorFilterScriptProps): null => {
  useEffect(() => {
    init(config).then(() => {
      onReady?.()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.siteKey])

  return null
}

export const VisitorFiltersScript = VisitorFilterScript

/**
 * Next.js Pages Router hook - call in _app.tsx.
 *
 * ```tsx
 * // pages/_app.tsx
 * import { useRouter } from 'next/router'
 * import { useVisitorFiltersNextPages } from '@visitorfilters/tracker/next'
 *
 * export default function App({ Component, pageProps }) {
 *   const router = useRouter()
 *   useVisitorFiltersNextPages({ siteKey: 'vf_live_xxx' }, router)
 *   return <Component {...pageProps} />
 * }
 * ```
 */
export const useVisitorFilterNextPages = (
  config: TrackerConfig,
  router: { events: { on: (event: string, cb: (url: string) => void) => void } },
): void => {
  useEffect(() => {
    init(config)

    const handleRouteChange = (url: string): void => {
      track('pageview', { path: url })
    }

    router.events.on('routeChangeComplete', handleRouteChange)
    // No cleanup needed - tracker is singleton
  }, [])
}

export const useVisitorFiltersNextPages = useVisitorFilterNextPages

/**
 * @deprecated Use `useVisitorFiltersNextPages` instead.
 */
export const initNextPages = useVisitorFilterNextPages
