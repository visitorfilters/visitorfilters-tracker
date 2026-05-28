# @visitorfilters/tracker

Official TypeScript SDK for [VisitorFilters](https://visitorfilters.com) - visitor intelligence & threat prevention.

## Installation

```bash
npm install @visitorfilters/tracker
# or
pnpm add @visitorfilters/tracker
# or
yarn add @visitorfilters/tracker
```

## Quick Start

```ts
import { init, track, identify } from '@visitorfilters/tracker'

// Initialize once (e.g. in your app entry point)
await init({ siteKey: 'vf_live_your_site_key' })

// Track custom events anywhere in your app
track('button_click', { label: 'Get Started', position: 'hero' })

// Identify the current user
identify({ email: 'user@example.com', plan: 'pro' })
```

---

## Framework Integrations

### React

```tsx
import { useVisitorFilters } from '@visitorfilters/tracker/react'

function HeroSection() {
  const { track } = useVisitorFilters({ siteKey: 'vf_live_xxx' })

  return (
    <button onClick={() => track('cta_click', { label: 'Start Free Trial' })}>
      Start Free Trial
    </button>
  )
}
```

**Page view tracking with React Router:**

```tsx
import { usePageView } from '@visitorfilters/tracker/react'
import { useLocation } from 'react-router-dom'

function Analytics() {
  const { pathname } = useLocation()
  usePageView(pathname)
  return null
}
```

---

### Next.js (App Router)

```tsx
// app/layout.tsx
import { VisitorFiltersScript } from '@visitorfilters/tracker/next'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <VisitorFiltersScript siteKey="vf_live_xxx" />
      </body>
    </html>
  )
}
```

**Pages Router (`_app.tsx`):**

```tsx
import { useVisitorFiltersNextPages } from '@visitorfilters/tracker/next'
import { useRouter } from 'next/router'

export default function App({ Component, pageProps }) {
  const router = useRouter()
  useVisitorFiltersNextPages({ siteKey: 'vf_live_xxx' }, router)
  return <Component {...pageProps} />
}
```

---

### Vue 3

**Plugin (recommended):**

```ts
// main.ts
import { createApp } from 'vue'
import { VisitorFiltersPlugin } from '@visitorfilters/tracker/vue'
import App from './App.vue'

createApp(App)
  .use(VisitorFiltersPlugin, { siteKey: 'vf_live_xxx' })
  .mount('#app')
```

**Composable:**

```vue
<script setup>
import { useVisitorFilters } from '@visitorfilters/tracker/vue'

const { track } = useVisitorFilters()
</script>

<template>
  <button @click="track('subscribe_click')">Subscribe</button>
</template>
```

**Vue Router page tracking:**

```ts
import { useRouteTracking } from '@visitorfilters/tracker/vue'
import { useRoute } from 'vue-router'

const route = useRoute()
useRouteTracking(route)
```

---

## API Reference

### `init(config)`

Initializes the tracker. Call once at app startup.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `siteKey` | `string` | **required** | Your site key from the VisitorFilters dashboard |
| `endpoint` | `string` | `https://visitorfilters.com` | Custom endpoint for self-hosted instances |
| `autoPageview` | `boolean` | `true` | Automatically send a pageview on init |
| `debug` | `boolean` | `false` | Log events to the console |

### `track(eventType, payload?)`

Track a custom event.

```ts
track('purchase', { value: 99, currency: 'USD', items: 3 })
track('video_play', { videoId: 'abc123', title: 'Demo' })
track('search', { query: 'threat prevention' })
```

### `identify(traits)`

Associate the current visitor with user traits.

```ts
identify({
  email: 'user@example.com',
  plan: 'pro',
  company: 'Acme Corp',
})
```

### `flush()`

Force-send all buffered events immediately.

```ts
await flush()
```

---

## Built-in Auto-Tracking

The SDK automatically tracks:

| Event | Trigger |
|-------|---------|
| `pageview` | On init and SPA route changes |
| `route_change` | `history.pushState` / `popstate` |
| `heartbeat` | Every 30 seconds while page is visible |
| `scroll` | Max scroll depth on page hide |
| `click` | Clicks on `<a>` and `<button>` elements |
| `form` | Form submission |
| `error` | Uncaught JavaScript errors |

---

## Self-Hosted

If you run your own VisitorFilters instance:

```ts
await init({
  siteKey: 'vf_live_xxx',
  endpoint: 'https://your-domain.com',
})
```

---

## License

MIT (c) [VisitorFilters](https://visitorfilters.com)
