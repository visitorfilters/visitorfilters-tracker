import type { TrackerConfig, TrackEvent, CollectorBatch, PolicyResponse, TrackerInstance } from '../types'
import { generateId } from './fingerprint'
import { getOrCreateSessionId, getOrCreateVisitorId } from './session'
import { sendBeaconOrFetch, postJson } from './transport'

const IMMEDIATE_TYPES = new Set(['pageview', 'route_change', 'error'])
const CRITICAL_TYPES = new Set(['pageview', 'session_end', 'route_change', 'error'])
const BATCH_FLUSH_SIZE = 10

export const createCollector = async (config: TrackerConfig): Promise<TrackerInstance> => {
  const { siteKey, debug = false } = config
  const baseUrl = (config.endpoint ?? 'https://visitorfilters.com').replace(/\/+$/, '')
  const ingestUrl = `${baseUrl}/collector/e`
  const policyUrl = `${baseUrl}/collector/policy`
  const challengeUrl = `${baseUrl}/collector/challenge`

  const sessionId = getOrCreateSessionId()
  const visitorId = await getOrCreateVisitorId()

  let eventQueue: TrackEvent[] = []
  let sequence = 0
  let mouseMoves = 0
  let keyPresses = 0
  let maxScroll = 0
  let currentPath = window.location.pathname
  let sessionEnded = false

  const log = (...args: unknown[]): void => {
    if (debug) console.log('[VF]', ...args)
  }

  // Bot signals
  document.addEventListener('mousemove', () => mouseMoves++, { passive: true })
  document.addEventListener('keydown', () => keyPresses++, { passive: true })

  // Batch builder
  const buildBatch = (events: TrackEvent[]): string => {
    const batch: CollectorBatch = {
      v: 1,
      key: siteKey,
      sid: sessionId,
      bid: generateId(),
      ts: new Date().toISOString(),
      page: {
        path: window.location.pathname,
        url: window.location.href,
        ref: document.referrer || null,
      },
      client: {
        lang: navigator.language ?? null,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
        screen: [screen.width, screen.height],
        viewport: [window.innerWidth, window.innerHeight],
        bot_signals: { mouse_moves: mouseMoves, key_presses: keyPresses },
      },
      events,
    }
    return JSON.stringify(batch)
  }

  // Throttle state
  const isThrottled = (): boolean => {
    const until = (window as any).vfThrottledUntil
    if (!until) return false
    if (Date.now() >= until) {
      ;(window as any).vfThrottledUntil = null
      return false
    }
    return true
  }

  // Flush
  const flush = async (): Promise<void> => {
    if (eventQueue.length === 0) return

    // Respect server throttle except for critical session_end via pagehide beacon.
    if (isThrottled()) {
      log('flush skipped - throttled')
      return
    }

    const batch = [...eventQueue]
    eventQueue = []
    log('flush', batch.length, 'events')
    sendBeaconOrFetch(ingestUrl, buildBatch(batch))
  }

  // Track
  const track = (type: string, payload: Record<string, unknown> = {}): void => {
    // Skip low-priority events during throttle to reduce queue buildup
    if (isThrottled() && !CRITICAL_TYPES.has(type)) {
      log('track skipped - throttled', type)
      return
    }

    const event: TrackEvent = {
      eid: generateId(),
      seq: sequence++,
      type,
      t: new Date().toISOString(),
      path: window.location.pathname,
      payload: Object.keys(payload).length > 0 ? payload : null,
    }
    eventQueue.push(event)
    log('track', type, payload)

    if (IMMEDIATE_TYPES.has(type) || eventQueue.length >= BATCH_FLUSH_SIZE) {
      void flush()
    }
  }

  // Identify
  const identify = (traits: Record<string, unknown>): void => {
    track('identify', traits)
  }

  // Policy check
  const checkPolicy = async (): Promise<void> => {
    try {
      const data = await postJson<PolicyResponse>(policyUrl, {
        key: siteKey,
        path: window.location.pathname,
        referrer: document.referrer || null,
        method: 'GET',
        sid: sessionId,
        vid: visitorId,
      })

      if (data.decision === 'block') {
        if (data.block_page_html) {
          document.documentElement.innerHTML = data.block_page_html
        } else if (data.redirect_url) {
          window.location.href = data.redirect_url
        } else {
          document.documentElement.innerHTML = '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Access Denied</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8fafc;color:#1e293b}.c{text-align:center;padding:2rem}.i{font-size:3rem;margin-bottom:1rem}h1{font-size:1.5rem;margin-bottom:.5rem}p{color:#64748b;font-size:.875rem}</style></head><body><div class="c"><div class="i">!</div><h1>Access Denied</h1><p>Your access to this site has been restricted.</p></div></body></html>'
        }
      } else if (data.decision === 'redirect' && data.redirect_url) {
        window.location.href = data.redirect_url
      } else if (
        (data.decision === 'challenge' || data.decision === 'js_challenge') &&
        data.challenge_token
      ) {
        await solveChallenge(data.challenge_token)
      } else if (data.decision === 'throttle') {
        ;(window as any).vfThrottledUntil = Date.now() + ((data.retry_after || 60) * 1000)
        log('throttled for', data.retry_after, 'seconds')
      }
    } catch {
      // Silent fail - never interrupt UX
    }
  }

  const solveChallenge = async (token: string): Promise<void> => {
    try {
      await postJson(challengeUrl, {
        key: siteKey,
        token,
        path: window.location.pathname,
        sid: sessionId,
        vid: visitorId,
      })
      setTimeout(() => void checkPolicy(), 100)
    } catch {
      // Silent fail
    }
  }

  // Lifecycle listeners
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (maxScroll > 0) track('scroll', { depth: maxScroll })
      void flush()
    }
  })

  window.addEventListener('pagehide', () => {
    if (sessionEnded) return
    sessionEnded = true
    track('session_end')
    void flush()
  })

  window.addEventListener('pageshow', (event) => {
    if (!event.persisted || !sessionEnded) return
    sessionEnded = false
    track('heartbeat', { reason: 'bfcache_restore' })
    void flush()
  })


  document.addEventListener('scroll', () => {
    const docHeight = document.documentElement.scrollHeight - window.innerHeight
    if (docHeight > 0) {
      const pct = Math.round((window.scrollY / docHeight) * 100)
      if (pct > maxScroll) maxScroll = pct
    }
  }, { passive: true })

  document.addEventListener('click', (e) => {
    const target = (e.target as Element).closest('a, button')
    if (target) {
      track('click', {
        tag: target.tagName,
        text: (target as HTMLElement).innerText?.substring(0, 50) ?? '',
      })
    }
  })

  document.addEventListener('submit', (e) => {
    const form = e.target as HTMLFormElement
    track('form', { action: form.action, id: form.id })
  })

  window.addEventListener('error', (e) => {
    track('error', { message: e.message, filename: e.filename, lineno: e.lineno })
  })

  // SPA route change
  const handleRouteChange = (): void => {
    if (currentPath !== window.location.pathname) {
      currentPath = window.location.pathname
      maxScroll = 0
      void checkPolicy()
      track('route_change')
    }
  }

  const originalPush = history.pushState.bind(history)
  history.pushState = (...args) => { originalPush(...args); handleRouteChange() }
  const originalReplace = history.replaceState.bind(history)
  history.replaceState = (...args) => { originalReplace(...args); handleRouteChange() }
  window.addEventListener('popstate', handleRouteChange)

  // Heartbeat
  setInterval(() => {
    if (document.visibilityState === 'visible' && !sessionEnded) {
      track('heartbeat')
      void flush()
    }
  }, 15_000)

  // Boot
  void checkPolicy()

  if (config.autoPageview !== false) {
    track('pageview')
  }

  // Dispatch ready event for external hooks (e.g. WP plugin)
  window.dispatchEvent(new CustomEvent('vf:ready', { detail: { track, identify } }))

  return {
    track,
    identify,
    flush,
    getSessionId: () => sessionId,
    getVisitorId: () => visitorId,
  }
}
