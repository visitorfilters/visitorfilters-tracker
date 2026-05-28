import { generateId, generateFingerprint } from './fingerprint'

const SESSION_KEY = 'vf_sid'
const VISITOR_KEY = 'vf_vid'

export const getOrCreateSessionId = (): string => {
  let sid = sessionStorage.getItem(SESSION_KEY)
  if (!sid) {
    sid = generateId()
    sessionStorage.setItem(SESSION_KEY, sid)
  }
  return sid
}

export const getOrCreateVisitorId = async (): Promise<string> => {
  let vid = localStorage.getItem(VISITOR_KEY)
  if (!vid) {
    vid = await generateFingerprint()
    localStorage.setItem(VISITOR_KEY, vid)
  }
  return vid
}

export const resetSession = (): string => {
  const sid = generateId()
  sessionStorage.setItem(SESSION_KEY, sid)
  return sid
}
