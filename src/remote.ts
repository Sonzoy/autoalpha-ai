/**
 * Remote mode — when the app is served by the AutoAlpha server daemon, the
 * browser becomes a control panel: the engine runs 24/7 on the server, the
 * UI polls server state and forwards actions. When served statically
 * (GitHub Pages, file://), everything runs locally as before.
 */
import { useStore } from './store/store'
import type { BrokerId } from './types'

const TOKEN_KEY = 'autoalpha-server-token'

export const remote = {
  active: false,
  unauthorized: false,
  token: (typeof localStorage !== 'undefined' && localStorage.getItem(TOKEN_KEY)) || ''
}

export async function detectServer(): Promise<boolean> {
  if (typeof location === 'undefined' || location.protocol === 'file:') return false
  try {
    const r = await fetch('api/health', { signal: AbortSignal.timeout(2500) })
    if (!r.ok) return false
    const j = await r.json()
    return j?.mode === 'server'
  } catch { return false }
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (remote.token) h.Authorization = `Bearer ${remote.token}`
  return h
}

export async function send(type: string, args: unknown[]): Promise<any> {
  const r = await fetch('api/action', { method: 'POST', headers: headers(), body: JSON.stringify({ type, args }) })
  if (r.status === 401) { remote.unauthorized = true; return 'Server rejected the access token.' }
  const j = await r.json().catch(() => null)
  if (!r.ok) return j?.error ?? 'Server error.'
  return j?.result ?? null
}

export async function remoteBrokerConnect(id: BrokerId): Promise<void> {
  await fetch(`api/broker/${id}/connect`, { method: 'POST', headers: headers() })
  await poll()
}
export async function remoteBrokerSync(id: BrokerId): Promise<void> {
  await fetch(`api/broker/${id}/sync`, { method: 'POST', headers: headers() })
  await poll()
}

async function poll(): Promise<void> {
  try {
    const r = await fetch('api/state', { headers: headers(), signal: AbortSignal.timeout(5000) })
    if (r.status === 401) { remote.unauthorized = true; return }
    if (!r.ok) return
    remote.unauthorized = false
    const j = await r.json()
    useStore.setState(j) // data only — action functions are preserved by zustand's merge
  } catch { /* transient network issue — next poll retries */ }
}

/** Replace store actions with server-forwarding versions. */
function wrapActions(): void {
  const forward = [
    'saveProfile', 'updateSettings', 'setAutoTrading', 'setEmergencyStop', 'pauseTrading',
    'resumeTrading', 'setSpeed', 'requestLive', 'setLiveUnlocked', 'setKillSwitch',
    'setAdminApprovedLive', 'resetDemo', 'setTradingMode', 'setLiveDataOnly',
    'setFirstLiveOrderAuthorized', 'setMarketKey', 'addCustomFeed', 'removeCustomFeed', 'setBrokerConfig'
  ]
  const patch: Record<string, unknown> = {}
  for (const n of forward) patch[n] = (...args: unknown[]) => { void send(n, args).then(() => poll()) }
  // auth actions return Promise<string|null> (error message or null)
  patch.signUp = async (...args: unknown[]) => { const r = await send('signUp', args); await poll(); return r }
  patch.logIn = async (...args: unknown[]) => { const r = await send('logIn', args); await poll(); return r }
  patch.logOut = () => { void send('logOut', []).then(() => poll()) }
  useStore.setState(patch as any)
}

let pollTimer: ReturnType<typeof setInterval> | null = null

export function startRemote(token: string): void {
  remote.active = true
  remote.token = token
  remote.unauthorized = false
  try { localStorage.setItem(TOKEN_KEY, token) } catch { /* ignore */ }
  wrapActions()
  void poll()
  if (!pollTimer) pollTimer = setInterval(poll, 2000)
}
