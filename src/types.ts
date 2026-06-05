export interface TrackerConfig {
  siteKey: string
  endpoint?: string
  trackLoggedIn?: boolean
  autoPageview?: boolean
  autoRouteChange?: boolean
  debug?: boolean
  brandingBadge?: string | boolean
  badgePosition?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  badgeVertical?: 'bottom' | 'top'
  badgeHorizontal?: 'right' | 'left'
  badgeOffsetX?: number | string
  badgeOffsetY?: number | string
}

export interface TrackEvent {
  eid: string
  seq: number
  type: string
  t: string
  path: string
  payload: Record<string, unknown> | null
}

export interface CollectorBatch {
  v: number
  key: string
  sid: string
  bid: string
  ts: string
  page: {
    path: string
    url: string
    ref: string | null
  }
  client: {
    lang: string | null
    tz: string | null
    screen: [number, number]
    viewport: [number, number]
    bot_signals: {
      mouse_moves: number
      key_presses: number
    }
  }
  events: TrackEvent[]
}

export interface PolicyPayload {
  key: string
  path: string
  referrer: string | null
  method: string
  sid: string
  vid: string
}

export type PolicyDecision = 'allow' | 'block' | 'redirect' | 'challenge' | 'js_challenge' | 'throttle'

export interface PolicyResponse {
  decision: PolicyDecision
  block_page_html?: string
  redirect_url?: string
  challenge_token?: string
  retry_after?: number
  branding?: {
    enabled: boolean
    url?: string
    title?: string | Record<string, string>
    text?: string | Record<string, string>
    icon_url?: string
    iconUrl?: string
    vertical?: 'bottom' | 'top'
    horizontal?: 'right' | 'left'
    v_offset?: number | string
    h_offset?: number | string
    position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
    badge_position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
    badgePosition?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
    offset_x?: number | string
    offset_y?: number | string
    offsetX?: number | string
    offsetY?: number | string
    badge_offset_x?: number | string
    badge_offset_y?: number | string
    badgeOffsetX?: number | string
    badgeOffsetY?: number | string
    text_i18n?: Record<string, string>
    title_i18n?: Record<string, string>
    localized_text?: Record<string, string>
    localized_title?: Record<string, string>
  }
}

export interface TrackerInstance {
  track: (eventType: string, payload?: Record<string, unknown>) => void
  identify: (traits: Record<string, unknown>) => void
  flush: () => Promise<void>
  getSessionId: () => string
  getVisitorId: () => string
}
