/**
 * AutoAlpha AI — 24/7 server daemon.
 *
 * Runs the exact same trading engine as the browser build, headless, around
 * the clock. Persists the workspace to disk, exposes a token-protected API,
 * and serves the built web UI (which auto-switches into remote-control mode
 * when served from here).
 *
 * Run:   AUTH_TOKEN=your-secret npm run server
 * Env:   PORT (default 8787) · DATA_DIR (default ./server-data) · AUTH_TOKEN
 *
 * One process = one trading workspace (one account, one broker setup).
 * Give each friend their own instance: different PORT + DATA_DIR.
 */
import fs from 'node:fs'
import path from 'node:path'

const PORT = Number(process.env.PORT || 8787)
const DATA_DIR = process.env.DATA_DIR || path.resolve('server-data')
const AUTH_TOKEN = process.env.AUTH_TOKEN || ''
const STORE_FILE = path.join(DATA_DIR, 'storage.json')

// ---------- file-backed localStorage shim (installed BEFORE engine import) ----------
fs.mkdirSync(DATA_DIR, { recursive: true })
let data: Record<string, string> = {}
try { if (fs.existsSync(STORE_FILE)) data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')) } catch { data = {} }
let flushTimer: ReturnType<typeof setTimeout> | null = null
const flush = () => {
  try { fs.writeFileSync(STORE_FILE, JSON.stringify(data)) } catch (e) { console.error('[storage] flush failed:', e) }
}
;(globalThis as any).localStorage = {
  getItem: (k: string) => data[k] ?? null,
  setItem: (k: string, v: string) => { data[k] = v; if (!flushTimer) flushTimer = setTimeout(() => { flushTimer = null; flush() }, 500) },
  removeItem: (k: string) => { delete data[k]; flush() }
}
process.on('SIGINT', () => { flush(); process.exit(0) })
process.on('SIGTERM', () => { flush(); process.exit(0) })

async function main() {
  // WebCrypto for password hashing on older Node versions
  if (!(globalThis as any).crypto?.subtle) {
    ;(globalThis as any).crypto = (await import('node:crypto')).webcrypto
  }

  const { useStore, freshWorkspace } = await import('../src/store/store')
  const { brokers, engineTick } = await import('../src/engine/TradingEngine')
  const express = (await import('express')).default

  const WS_FIELDS = Object.keys(freshWorkspace())

  // Rehydrate broker adapters from persisted config
  const hydrateAdapters = () => {
    const s = useStore.getState()
    ;(brokers.ibkr as any).configure(s.brokerConfig?.ibkr ?? null)
    ;(brokers.etoro as any).configure(s.brokerConfig?.etoro ?? null)
  }
  hydrateAdapters()

  // Keep the paper venue connected whenever a user is onboarded
  const ensurePaper = async () => {
    const s = useStore.getState()
    if (s.currentUser && s.profile.onboarded && s.brokerConn.paper.status !== 'connected') {
      const r = await brokers.paper.connect()
      useStore.getState().setBrokerConn('paper', {
        status: 'connected', message: r.message, permissions: r.permissions, healthy: true, lastSync: Date.now()
      })
    }
  }

  // ---------- 24/7 engine loop (respects the workspace speed setting) ----------
  const SPEED_MS: Record<number, number> = { 1: 8000, 10: 2500, 60: 800 }
  let lastTick = 0
  setInterval(() => {
    const s = useStore.getState()
    const interval = SPEED_MS[s.speed] ?? 8000
    if (Date.now() - lastTick < interval) return
    lastTick = Date.now()
    void ensurePaper().then(() => engineTick()).catch(e => console.error('[engine]', e))
  }, 400)
  console.log(`[engine] 24/7 loop armed (speed follows workspace setting; data: ${DATA_DIR})`)

  // ---------- API ----------
  const app = express()
  app.use(express.json({ limit: '256kb' }))

  if (!AUTH_TOKEN) {
    console.warn('[security] AUTH_TOKEN is NOT set — anyone who can reach this port controls the engine. Set AUTH_TOKEN.')
  }
  const auth = (req: any, res: any, next: any) => {
    if (!AUTH_TOKEN) return next()
    if ((req.headers.authorization || '') === `Bearer ${AUTH_TOKEN}`) return next()
    res.status(401).json({ error: 'unauthorized' })
  }

  app.get('/api/health', (_req, res) => res.json({ ok: true, mode: 'server', ts: Date.now() }))

  app.get('/api/state', auth, (_req, res) => {
    const s = useStore.getState() as any
    const out: any = { currentUser: s.currentUser }
    for (const f of WS_FIELDS) out[f] = s[f]
    out.users = (s.users ?? []).map((u: any) => ({ name: u.name, email: u.email })) // never expose hashes
    res.json(out)
  })

  // Whitelisted store actions, invoked by the remote UI
  const ACTIONS = new Set([
    'signUp', 'logIn', 'logOut', 'saveProfile', 'updateSettings',
    'setAutoTrading', 'setEmergencyStop', 'pauseTrading', 'resumeTrading', 'setSpeed',
    'requestLive', 'setLiveUnlocked', 'setKillSwitch', 'setAdminApprovedLive', 'resetDemo',
    'setTradingMode', 'setLiveDataOnly', 'setFirstLiveOrderAuthorized',
    'setMarketKey', 'addCustomFeed', 'removeCustomFeed', 'setBrokerConfig', 'setBrokerConn'
  ])
  app.post('/api/action', auth, async (req, res) => {
    const { type, args = [] } = req.body ?? {}
    if (!ACTIONS.has(type)) return res.status(400).json({ error: `unknown action: ${type}` })
    try {
      const fn = (useStore.getState() as any)[type]
      const result = await fn(...args)
      if (type === 'setBrokerConfig') hydrateAdapters()
      res.json({ ok: true, result: result ?? null })
    } catch (e) {
      res.status(500).json({ error: String(e) })
    }
  })

  // Broker connect/sync run server-side (no browser CORS limits here)
  app.post('/api/broker/:id/connect', auth, async (req, res) => {
    const id = req.params.id as 'paper' | 'ibkr' | 'etoro'
    if (!brokers[id]) return res.status(400).json({ error: 'unknown broker' })
    const r = await brokers[id].connect()
    useStore.getState().setBrokerConn(id, {
      status: brokers[id].status(), message: r.message, permissions: r.permissions,
      healthy: brokers[id].healthy(), lastSync: r.ok ? Date.now() : null
    })
    res.json(r)
  })
  app.post('/api/broker/:id/sync', auth, async (req, res) => {
    const id = req.params.id as 'paper' | 'ibkr' | 'etoro'
    if (!brokers[id]) return res.status(400).json({ error: 'unknown broker' })
    const r = await brokers[id].sync()
    useStore.getState().setBrokerConn(id, { message: r.message, healthy: brokers[id].healthy(), status: brokers[id].status(), ...(r.ok ? { lastSync: Date.now() } : {}) })
    res.json(r)
  })

  // Serve the built SPA
  const dist = path.resolve('dist')
  if (fs.existsSync(dist)) {
    app.use(express.static(dist))
    console.log(`[web] serving UI from ${dist}`)
  } else {
    console.warn('[web] dist/ not found — run `npm run build` first to serve the UI')
  }

  app.listen(PORT, () => {
    console.log(`\nAutoAlpha AI server running → http://localhost:${PORT}`)
    console.log('The engine trades 24/7 as long as this process runs (use pm2/launchd to keep it alive).')
    console.log(`Workspace: ${useStore.getState().currentUser ?? '(none yet — open the UI and sign up)'}\n`)
  })
}

main().catch(e => { console.error(e); process.exit(1) })
