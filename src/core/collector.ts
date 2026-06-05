import type { TrackerConfig, TrackEvent, CollectorBatch, PolicyResponse, TrackerInstance } from '../types'
import { generateId } from './fingerprint'
import { getOrCreateSessionId, getOrCreateVisitorId } from './session'
import { sendBeaconOrFetch, postJson } from './transport'

const IMMEDIATE_TYPES = new Set(['pageview', 'route_change', 'layout_snapshot', 'error'])
const CRITICAL_TYPES = new Set(['pageview', 'session_end', 'route_change', 'error'])
const BATCH_FLUSH_SIZE = 10

type LayoutElement = {
  tag: unknown
  role: unknown
  label: unknown
  selector: unknown
  x: number
  y: number
  width: number
  height: number
}

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
  let lastLayoutHash: string | null = null
  const sentLayoutSnapshots = new Set<string>()

  const log = (...args: unknown[]): void => {
    if (debug) console.log('[VF]', ...args)
  }

  const badgeId = 'vf-branding-badge'

  const renderBrandingBadge = (branding: any): void => {
    const existing = document.getElementById(badgeId)

    const brandingBadgePreference = typeof config.brandingBadge !== 'undefined'
      ? (typeof config.brandingBadge === 'boolean' ? (config.brandingBadge ? '1' : '0') : config.brandingBadge)
      : undefined

    if (brandingBadgePreference === '0' || !branding || branding.enabled !== true) {
      if (existing) existing.remove()
      return
    }

    if (existing) existing.remove()

    const offset = (value: unknown, fallback: number): number => {
      const parsed = parseInt(String(value), 10)
      if (!Number.isFinite(parsed)) return fallback

      return Math.max(0, Math.min(parsed, 1000))
    }

    let vertical = branding.vertical === 'top' ? 'top' : 'bottom'
    let horizontal = branding.horizontal === 'left' ? 'left' : 'right'
    let vOffset = offset(branding.v_offset, 14)
    let hOffset = offset(branding.h_offset, 14)

    if (config.badgePosition || !branding.vertical) {
      const badgePosition = config.badgePosition || 'bottom-right'
      const parts = badgePosition.split('-')
      if (parts.length === 2) {
        vertical = parts[0] === 'top' ? 'top' : 'bottom'
        horizontal = parts[1] === 'left' ? 'left' : 'right'
      }
    }

    if (typeof config.badgeOffsetY !== 'undefined') vOffset = offset(config.badgeOffsetY, 14)
    if (typeof config.badgeOffsetX !== 'undefined') hOffset = offset(config.badgeOffsetX, 14)

    const placementStyles = [
      `${vertical}:${vOffset}px`,
      `${horizontal}:${hOffset}px`,
    ]

    const link = document.createElement('a')
    link.id = badgeId
    link.href = branding.url || 'https://visitorfilters.com?ref=badge'
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.title = branding.title || 'Visitor protection by VisitorFilters'
    link.setAttribute('aria-label', link.title)
    link.style.cssText = [
      ...placementStyles,
      'position:fixed',
      'z-index:2147483647',
      'display:inline-flex',
      'align-items:center',
      'gap:7px',
      'max-width:calc(100vw - 28px)',
      'padding:6px 9px',
      'border:1px solid rgba(15,23,42,.12)',
      'border-radius:4px',
      'background:rgba(255,255,255,.94)',
      'color:#334155',
      'font:500 11px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'text-decoration:none',
      'box-shadow:0 2px 8px rgba(15,23,42,.12)',
      'backdrop-filter:saturate(120%) blur(4px)',
    ].join(';')

    const icon = document.createElement('img')
    icon.src = branding.icon_url || '/favicon.svg'
    icon.alt = ''
    icon.width = 14
    icon.height = 14
    icon.loading = 'lazy'
    icon.decoding = 'async'
    icon.style.cssText = 'width:14px;height:14px;display:block;flex:0 0 auto'

    const text = document.createElement('span')
    text.textContent = branding.text || 'Protected by VisitorFilters'
    text.style.cssText = 'display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'

    link.appendChild(icon)
    link.appendChild(text)

    const mount = () => document.body && document.body.appendChild(link)
    if (document.body) {
      mount()
    } else {
      document.addEventListener('DOMContentLoaded', mount, { once: true })
    }
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
    sendBeaconOrFetch(ingestUrl, buildBatch(batch), (data) => {
      if (data && data.enforce) {
        void checkPolicy()
      }
    })
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

      renderBrandingBadge(data.branding)

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
      } else if (data.decision === 'js_challenge' && data.challenge_token) {
        document.documentElement.innerHTML = '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Just a moment...</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8fafc;color:#1e293b}.c{text-align:center;padding:2rem}.loader{border:4px solid #f3f3f3;border-top:4px solid #3b82f6;border-radius:50%;width:40px;height:40px;animation:spin 1s linear infinite;margin:0 auto 1.5rem}@keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}h1{font-size:1.5rem;margin-bottom:.5rem}p{color:#64748b;font-size:.875rem}</style></head><body><div class="c"><div class="loader"></div><h1>Checking your browser before accessing the site.</h1><p>This process is automatic. Your browser will redirect to your requested content shortly.</p></div></body></html>'
        setTimeout(() => void solveChallenge(data.challenge_token!, true), 2500)
      } else if (data.decision === 'challenge' && data.challenge_token) {
        document.documentElement.innerHTML = '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Security Check</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8fafc;color:#1e293b}.c{text-align:center;padding:2rem;background:#fff;border-radius:8px;box-shadow:0 4px 6px -1px rgb(0 0 0 / .1)}h1{font-size:1.5rem;margin-bottom:1rem}p{color:#64748b;font-size:.875rem;margin-bottom:1.5rem}.btn{background:#3b82f6;color:#fff;border:none;padding:.75rem 1.5rem;font-size:1rem;border-radius:6px;cursor:pointer;transition:background .2s}.btn:hover{background:#2563eb}</style></head><body><div class="c"><h1>Security Check</h1><p>Please verify you are human to continue.</p><button class="btn" id="vf-human-btn">I am human</button></div></body></html>'
        const btn = document.getElementById('vf-human-btn')
        if (btn) {
          btn.addEventListener('click', (e) => {
            const target = e.target as HTMLButtonElement
            target.innerText = 'Verifying...'
            target.disabled = true
            void solveChallenge(data.challenge_token!, true)
          })
        }
      } else if (data.decision === 'throttle') {
        ;(window as any).vfThrottledUntil = Date.now() + ((data.retry_after || 60) * 1000)
        log('throttled for', data.retry_after, 'seconds')
      }
    } catch {
      // Silent fail - never interrupt UX
    }
  }

  const solveChallenge = async (token: string, reload = false): Promise<void> => {
    try {
      await postJson(challengeUrl, {
        key: siteKey,
        token,
        path: window.location.pathname,
        sid: sessionId,
        vid: visitorId,
      }, { keepalive: true })
      
      if (reload) {
        window.location.reload()
      } else {
        setTimeout(() => void checkPolicy(), 100)
      }
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

  const cssEscape = (value: string): string => {
    return window.CSS?.escape ? window.CSS.escape(value) : value.replace(/["\\]/g, '\\$&')
  }

  const selectorPart = (element: Element): string => {
    const tag = element.tagName.toLowerCase()

    if (element.id) {
      return `${tag}#${cssEscape(element.id)}`
    }

    const testIdAttr = element.hasAttribute('data-testid') ? 'data-testid' : (element.hasAttribute('data-test') ? 'data-test' : null)
    const testId = testIdAttr ? element.getAttribute(testIdAttr) : null
    if (testId) {
      return `${tag}[${testIdAttr}="${cssEscape(testId)}"]`
    }

    const heatmapLabel = element.getAttribute('data-heatmap-label')
    if (heatmapLabel) {
      return `${tag}[data-heatmap-label="${cssEscape(heatmapLabel.substring(0, 80))}"]`
    }

    const role = element.getAttribute('role')
    if (role) {
      return `${tag}[role="${cssEscape(role)}"]`
    }

    let index = 1
    let sibling = element.previousElementSibling
    while (sibling) {
      if (sibling.tagName === element.tagName) index++
      sibling = sibling.previousElementSibling
    }

    return `${tag}:nth-of-type(${index})`
  }

  const elementSelector = (element: Element): string => {
    const parts: string[] = []
    let current: Element | null = element

    while (current && current.nodeType === 1 && current !== document.body && parts.length < 4) {
      parts.unshift(selectorPart(current))
      current = current.parentElement
    }

    return parts.join(' > ')
  }

  const heatmapElement = (target: EventTarget | null): Element | null => {
    if (!(target instanceof Element)) return null

    return target.closest(
      'a, button, input, select, textarea, summary, label, [role="button"], [role="link"], [data-heatmap-label], [data-testid], [data-test], [aria-label]',
    ) || target
  }

  const elementPayload = (element: Element | null): Record<string, unknown> => {
    if (!element) return {}

    const isFormControl = ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)
    const text = isFormControl ? '' : (element.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 120)
    const label = (
      element.getAttribute('data-heatmap-label') ||
      element.getAttribute('aria-label') ||
      element.getAttribute('title') ||
      text ||
      element.getAttribute('name') ||
      element.getAttribute('id') ||
      ''
    ).trim().replace(/\s+/g, ' ').substring(0, 120)

    return {
      element_tag: element.tagName.toLowerCase(),
      element_role: element.getAttribute('role') || null,
      element_label: label || null,
      element_text: text || null,
      element_selector: elementSelector(element),
    }
  }

  const hash64 = (value: string): string => {
    let hash = 0x811c9dc5

    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i)
      hash = Math.imul(hash, 0x01000193)
    }

    const part = (hash >>> 0).toString(16).padStart(8, '0')

    return part.repeat(8).substring(0, 64)
  }

  const normalizedRect = (element: Element): { x: number; y: number; width: number; height: number } | null => {
    const rect = element.getBoundingClientRect()
    const viewportWidth = Math.max(window.innerWidth, 1)
    const viewportHeight = Math.max(window.innerHeight, 1)
    const left = Math.max(0, Math.min(rect.left, viewportWidth))
    const top = Math.max(0, Math.min(rect.top, viewportHeight))
    const right = Math.max(0, Math.min(rect.right, viewportWidth))
    const bottom = Math.max(0, Math.min(rect.bottom, viewportHeight))
    const width = right - left
    const height = bottom - top

    if (width < 4 || height < 4) return null

    return {
      x: Math.round((left / viewportWidth) * 1000),
      y: Math.round((top / viewportHeight) * 1000),
      width: Math.round((width / viewportWidth) * 1000),
      height: Math.round((height / viewportHeight) * 1000),
    }
  }

  const layoutElements = (): LayoutElement[] => {
    if (typeof document.querySelectorAll !== 'function') return []

    const selector = 'a, button, input, select, textarea, summary, label, [role="button"], [role="link"], [data-heatmap-label], [data-testid], [data-test], [aria-label]'
    const seen = new Set<string>()

    return Array.from(document.querySelectorAll(selector))
      .slice(0, 160)
      .map((element) => {
        const rect = normalizedRect(element)
        if (!rect) return null

        const payload = elementPayload(element)
        const elementKey = String(payload.element_selector || '')
        if (!elementKey || seen.has(elementKey)) return null
        seen.add(elementKey)

        return {
          tag: payload.element_tag,
          role: payload.element_role,
          label: payload.element_label,
          selector: payload.element_selector,
          ...rect,
        }
      })
      .filter((element): element is LayoutElement => element !== null)
      .slice(0, 80)
  }

  const captureLayoutSnapshot = (): void => {
    const elements = layoutElements()
    if (elements.length === 0) return

    const viewport = `${window.innerWidth}x${window.innerHeight}`
    const signature = [
      window.location.pathname,
      viewport,
      elements.map((element) => `${element.selector}:${element.label}:${element.x}:${element.y}:${element.width}:${element.height}`).join(';'),
    ].join('|')
    const domHash = hash64(signature)
    const snapshotKey = `${window.location.pathname}|${viewport}|${domHash}`

    lastLayoutHash = domHash

    if (sentLayoutSnapshots.has(snapshotKey)) return
    sentLayoutSnapshots.add(snapshotKey)

    track('layout_snapshot', {
      dom_hash: domHash,
      viewport_w: window.innerWidth,
      viewport_h: window.innerHeight,
      elements,
    })
  }

  document.addEventListener('click', (e) => {
    const target = heatmapElement(e.target)
    const x = Math.round(e.clientX || 0)
    const y = Math.round(e.clientY || 0)
    const clickPayload = {
      x,
      y,
      viewport_x: x,
      viewport_y: y,
      page_x: Math.round(e.pageX || x + window.scrollX),
      page_y: Math.round(e.pageY || y + window.scrollY),
      scroll_x: Math.round(window.scrollX || 0),
      scroll_y: Math.round(window.scrollY || 0),
      document_w: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
      document_h: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0),
      dom_hash: lastLayoutHash || hash64(`${window.location.pathname}|${window.innerWidth}x${window.innerHeight}`),
      ...elementPayload(target),
    }

    track('heatmap_sample', clickPayload)

    if (target) {
      track('click', {
        ...clickPayload,
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
      setTimeout(() => captureLayoutSnapshot(), 250)
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
    setTimeout(() => captureLayoutSnapshot(), 250)
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
