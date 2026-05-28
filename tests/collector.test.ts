import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ decision: 'allow' }) })
const mockSendBeacon = vi.fn().mockReturnValue(true)
const mockRandomUUID = vi.fn(() => 'test-uuid-1234')

vi.stubGlobal('fetch', mockFetch)
vi.stubGlobal('navigator', {
  sendBeacon: mockSendBeacon,
  language: 'en-US',
  userAgent: 'test-agent',
})
vi.stubGlobal('crypto', {
  randomUUID: mockRandomUUID,
  subtle: {
    digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
  },
})
vi.stubGlobal('screen', { width: 1920, height: 1080, colorDepth: 24 })
vi.stubGlobal('Intl', {
  DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: 'UTC' }) }),
})

// Mock storage
const sessionStore: Record<string, string> = {}
const localStore: Record<string, string> = {}

vi.stubGlobal('sessionStorage', {
  getItem: (k: string) => sessionStore[k] ?? null,
  setItem: (k: string, v: string) => { sessionStore[k] = v },
})
vi.stubGlobal('localStorage', {
  getItem: (k: string) => localStore[k] ?? null,
  setItem: (k: string, v: string) => { localStore[k] = v },
})

vi.stubGlobal('document', {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  referrer: '',
  visibilityState: 'visible',
  documentElement: { scrollHeight: 1000 },
  currentScript: null,
})

vi.stubGlobal('window', {
  location: { pathname: '/test', href: 'https://example.com/test' },
  innerWidth: 1280,
  innerHeight: 800,
  scrollY: 0,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
  history: {
    pushState: vi.fn(),
    replaceState: vi.fn(),
  },
})

vi.stubGlobal('history', {
  pushState: vi.fn(),
  replaceState: vi.fn(),
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('generateId', () => {
  it('returns a UUID using crypto.randomUUID when available', async () => {
    const { generateId } = await import('../src/core/fingerprint')
    const id = generateId()
    expect(id).toBe('test-uuid-1234')
  })
})

describe('session management', () => {
  beforeEach(() => {
    delete sessionStore['vf_sid']
    delete localStore['vf_vid']
  })

  it('creates a new session id if none exists', async () => {
    const { getOrCreateSessionId } = await import('../src/core/session')
    const sid = getOrCreateSessionId()
    expect(sid).toBe('test-uuid-1234')
    expect(sessionStore['vf_sid']).toBe('test-uuid-1234')
  })

  it('reuses an existing session id', async () => {
    sessionStore['vf_sid'] = 'existing-sid'
    const { getOrCreateSessionId } = await import('../src/core/session')
    const sid = getOrCreateSessionId()
    expect(sid).toBe('existing-sid')
  })
})

describe('transport', () => {
  beforeEach(() => {
    mockFetch.mockClear()
    mockSendBeacon.mockClear()
    vi.stubGlobal('navigator', {
      ...navigator,
      sendBeacon: mockSendBeacon,
    })
  })

  it('uses fetch when page is visible', async () => {
    vi.stubGlobal('document', { ...document, visibilityState: 'visible' })
    const { sendBeaconOrFetch } = await import('../src/core/transport')
    sendBeaconOrFetch('https://example.com/collector/e', '{"test":1}')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/collector/e',
      expect.objectContaining({ method: 'POST', body: '{"test":1}' }),
    )
    expect(mockSendBeacon).not.toHaveBeenCalled()
  })

  it('uses sendBeacon when page is hidden', async () => {
    vi.stubGlobal('document', { ...document, visibilityState: 'hidden' })
    const { sendBeaconOrFetch } = await import('../src/core/transport')
    sendBeaconOrFetch('https://example.com/collector/e', '{"test":1}')
    expect(mockSendBeacon).toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('tracker API', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('init returns a tracker instance with track, identify, flush methods', async () => {
    const { init } = await import('../src/index')
    const instance = await init({ siteKey: 'vf_test_key', debug: false })

    expect(typeof instance.track).toBe('function')
    expect(typeof instance.identify).toBe('function')
    expect(typeof instance.flush).toBe('function')
    expect(typeof instance.getSessionId).toBe('function')
    expect(typeof instance.getVisitorId).toBe('function')
  })

  it('getSessionId returns a non-empty string', async () => {
    const { init } = await import('../src/index')
    const instance = await init({ siteKey: 'vf_test_key' })
    expect(instance.getSessionId()).toBeTruthy()
  })
})
