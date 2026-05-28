const sha256 = async (message: string): Promise<string> => {
  const buffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export const generateFingerprint = async (): Promise<string> => {
  let fp = navigator.userAgent + navigator.language + screen.colorDepth

  await new Promise((r) => setTimeout(r, 0))

  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.textBaseline = 'top'
      ctx.font = '14px Arial'
      ctx.fillText('VisitorFilters', 2, 2)
      fp += canvas.toDataURL()
    }
  } catch {
    fp += 'no-canvas'
  }

  await new Promise((r) => setTimeout(r, 0))

  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') as WebGLRenderingContext | null
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info')
      if (dbg) {
        fp += gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)
        fp += gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
      }
    }
  } catch {
    fp += 'no-webgl'
  }

  return sha256(fp)
}

export const generateId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
