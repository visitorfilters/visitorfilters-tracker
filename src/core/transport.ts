export const sendBeaconOrFetch = (url: string, body: string, onResponse?: (data: any) => void): void => {
  if (navigator.sendBeacon && document.visibilityState === 'hidden') {
    navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
    return
  }

  let retries = 0

  const attempt = (): void => {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    })
      .then((res) => {
        if (res.ok && onResponse) {
          res.json().then(data => onResponse(data)).catch(() => {})
        }
      })
      .catch(() => {
      if (retries < 3) {
        retries++
        setTimeout(attempt, Math.pow(2, retries) * 1000)
      }
    })
  }

  attempt()
}

export const postJson = async <T>(url: string, payload: unknown, options?: RequestInit): Promise<T> => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    ...options,
  })
  return res.json() as Promise<T>
}
