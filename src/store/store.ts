import { create } from 'zustand'
import type {
  AssetState, AuditEvent, BinanceConfig, BrokerConnState, BrokerId, BrokerPortfolio, CustomFeed,
  EtoroConfig, IbkrConfig, IntelSnapshot, PerfPoint, Position, PriceSource, Regime, RiskSettings,
  SimSpeed, StrategyName, ThemeMode, Trade, TradingMode, UserProfile
} from '../types'
import { RISK_DEFAULTS } from '../types'
import { AuditLogger } from '../engine/AuditLogger'

export const START_CASH = 100_000

// ---------------------------------------------------------------------------
// Persistence model — per-user isolation:
//   GLOBAL_KEY holds only the account directory (users + who is logged in).
//   Each user's entire workspace (portfolio, trades, settings, broker config,
//   audit log) lives under its own WS_PREFIX+email key and is only loaded
//   into memory after that user authenticates. Logging out flushes and clears
//   the in-memory workspace. NOTE: this is client-side isolation, gated by
//   login — device-level attackers can read localStorage. Server-side auth is
//   required for production-grade isolation.
// ---------------------------------------------------------------------------
const GLOBAL_KEY = 'autoalpha-global'
const WS_PREFIX = 'autoalpha-ws:'
const LEGACY_KEY = 'autoalpha-ai'

const storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null

// Passwords are stored as salted SHA-256 hashes, never plaintext.
interface StoredUser { name: string; email: string; passwordHash: string; password?: string }

export async function hashPassword(password: string, email: string): Promise<string> {
  const data = new TextEncoder().encode(`autoalpha:${email}:${password}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const emptyProfile: UserProfile = {
  name: '', email: '', experience: '', riskProfile: 'Balanced',
  markets: ['Stocks', 'ETFs'], broker: 'paper',
  riskAcknowledged: false, autoTradeConsent: false, onboarded: false
}

const initialBrokerConn = (): Record<BrokerId, BrokerConnState> => ({
  paper: { status: 'disconnected', message: 'Not initialized', lastSync: null, permissions: [], healthy: false },
  ibkr: { status: 'disconnected', message: 'Not connected', lastSync: null, permissions: [], healthy: false },
  etoro: { status: 'disconnected', message: 'Not connected', lastSync: null, permissions: [], healthy: false },
  binance: { status: 'disconnected', message: 'Not connected', lastSync: null, permissions: [], healthy: false }
})

export interface Workspace {
  profile: UserProfile
  settings: RiskSettings
  autoTrading: boolean
  emergencyStop: boolean
  autoPaused: boolean
  pauseReason: string
  tradingMode: TradingMode
  liveUnlocked: boolean
  liveRequested: boolean
  speed: SimSpeed
  assets: AssetState[]
  intel: Record<string, IntelSnapshot>
  regime: Regime
  engineMode: StrategyName
  engineNote: string
  lastConfidence: number
  assetSources: Record<string, PriceSource>
  cash: number
  dayStartEquity: number
  peakEquity: number
  dayStamp: string
  positions: Position[]
  trades: Trade[]
  perf: PerfPoint[]
  audit: AuditEvent[]
  brokerConn: Record<BrokerId, BrokerConnState>
  brokerConfig: { ibkr: IbkrConfig | null; etoro: EtoroConfig | null; binance: BinanceConfig | null }
  marketKeys: { finnhub: string }
  customFeeds: CustomFeed[]
  brokerPortfolio: BrokerPortfolio | null
  theme: ThemeMode
  liveDataOnly: boolean
  firstLiveOrderAuthorized: boolean
  killSwitch: boolean
  adminApprovedLive: boolean
}

export function freshWorkspace(): Workspace {
  return {
    profile: { ...emptyProfile },
    settings: { ...RISK_DEFAULTS.Balanced },
    autoTrading: false, emergencyStop: false, autoPaused: false, pauseReason: '',
    tradingMode: 'paper', liveUnlocked: false, liveRequested: false, speed: 10,
    assets: [], intel: {}, regime: 'Ranging',
    engineMode: 'Cash / Risk-Off', engineNote: 'Engine idle.', lastConfidence: 0,
    assetSources: {},
    cash: START_CASH, dayStartEquity: START_CASH, peakEquity: START_CASH,
    dayStamp: new Date().toDateString(), positions: [], trades: [], perf: [], audit: [],
    brokerConn: initialBrokerConn(),
    brokerConfig: { ibkr: null, etoro: null, binance: null },
    marketKeys: { finnhub: '' },
    customFeeds: [],
    brokerPortfolio: null,
    theme: 'dark',
    liveDataOnly: true, // never trade on simulated prices unless explicitly allowed
    firstLiveOrderAuthorized: false,
    killSwitch: false, adminApprovedLive: false
  }
}

const WS_FIELDS = Object.keys(freshWorkspace()) as (keyof Workspace)[]

function loadGlobal(): { users: StoredUser[]; currentUser: string | null } {
  try {
    const raw = storage?.getItem(GLOBAL_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* corrupted — start fresh */ }
  return migrateLegacy() ?? { users: [], currentUser: null }
}

function loadWorkspace(email: string): Workspace | null {
  try {
    const raw = storage?.getItem(WS_PREFIX + email)
    if (raw) {
      const parsed = JSON.parse(raw)
      const fresh = freshWorkspace()
      const ws: Workspace = { ...fresh, ...parsed }
      // Nested records need deep-merging: workspaces saved by older builds
      // lack keys added later (e.g. a new broker), and a shallow merge would
      // let the stale object shadow the new defaults → runtime crashes.
      ws.brokerConn = { ...fresh.brokerConn, ...(parsed.brokerConn ?? {}) }
      ws.brokerConfig = { ...fresh.brokerConfig, ...(parsed.brokerConfig ?? {}) }
      ws.marketKeys = { ...fresh.marketKeys, ...(parsed.marketKeys ?? {}) }
      ws.settings = { ...fresh.settings, ...(parsed.settings ?? {}) } // backfill new risk settings
      return ws
    }
  } catch { /* corrupted workspace — fresh */ }
  return null
}

/** One-time migration from the old single-blob storage format. */
function migrateLegacy(): { users: StoredUser[]; currentUser: string | null } | null {
  try {
    const raw = storage?.getItem(LEGACY_KEY)
    if (!raw) return null
    const st = JSON.parse(raw)?.state
    if (!st) return null
    const users: StoredUser[] = (st.users ?? []).map((u: any) => ({
      name: u.name, email: u.email, passwordHash: u.passwordHash ?? '', password: u.password
    }))
    const g = { users, currentUser: st.currentUser ?? null }
    storage?.setItem(GLOBAL_KEY, JSON.stringify(g))
    if (st.currentUser) {
      const ws: any = { ...freshWorkspace() }
      for (const f of WS_FIELDS) if (st[f] !== undefined) ws[f] = st[f]
      storage?.setItem(WS_PREFIX + st.currentUser, JSON.stringify(ws))
    }
    storage?.removeItem(LEGACY_KEY)
    return g
  } catch { return null }
}

function persistNow(s: AppState): void {
  if (!storage) return
  try {
    storage.setItem(GLOBAL_KEY, JSON.stringify({ users: s.users, currentUser: s.currentUser }))
    if (s.currentUser) {
      const ws: any = {}
      for (const f of WS_FIELDS) ws[f] = s[f]
      ws.audit = s.audit.slice(0, 300)
      ws.perf = s.perf.slice(-600)
      storage.setItem(WS_PREFIX + s.currentUser, JSON.stringify(ws))
    }
  } catch { /* storage full — non-fatal */ }
}

export interface AppState extends Workspace {
  users: StoredUser[]
  currentUser: string | null
  // Volatile remote-connection health (never persisted): drives visible
  // warnings instead of silent failures
  remoteUnauthorized: boolean
  serverOk: boolean
  signUp: (name: string, email: string, password: string) => Promise<string | null>
  logIn: (email: string, password: string) => Promise<string | null>
  logOut: () => void
  saveProfile: (p: Partial<UserProfile>) => void
  updateSettings: (s: Partial<RiskSettings>) => void
  setAutoTrading: (v: boolean) => void
  setEmergencyStop: (v: boolean) => void
  pauseTrading: (reason: string) => void
  resumeTrading: () => void
  setSpeed: (s: SimSpeed) => void
  requestLive: () => void
  setLiveUnlocked: (v: boolean) => void
  setMarket: (assets: AssetState[], intel: Record<string, IntelSnapshot>, regime: Regime) => void
  setEngineStatus: (mode: StrategyName, note: string, confidence: number) => void
  setAssetSources: (m: Record<string, PriceSource>) => void
  setCash: (v: number) => void
  rollDay: (equity: number) => void
  setPeak: (v: number) => void
  addTrade: (t: Trade) => void
  patchTrade: (id: string, patch: Partial<Trade>) => void
  addPosition: (p: Position) => void
  patchPosition: (tradeId: string, patch: Partial<Position>) => void
  removePosition: (tradeId: string) => void
  pushPerf: (p: PerfPoint) => void
  addAudit: (e: AuditEvent) => void
  setBrokerConn: (id: BrokerId, patch: Partial<BrokerConnState>) => void
  setBrokerConfig: (id: 'ibkr' | 'etoro' | 'binance', cfg: IbkrConfig | EtoroConfig | BinanceConfig | null) => void
  setMarketKey: (provider: 'finnhub', key: string) => void
  addCustomFeed: (f: CustomFeed) => void
  removeCustomFeed: (id: string) => void
  setBrokerPortfolio: (p: BrokerPortfolio | null) => void
  setTheme: (t: ThemeMode) => void
  setLiveDataOnly: (v: boolean) => void
  setFirstLiveOrderAuthorized: (v: boolean) => void
  setTradingMode: (m: TradingMode) => void
  setKillSwitch: (v: boolean) => void
  setAdminApprovedLive: (v: boolean) => void
  resetDemo: () => void
}

const boot = loadGlobal()
const bootWs = boot.currentUser ? (loadWorkspace(boot.currentUser) ?? freshWorkspace()) : freshWorkspace()

export const useStore = create<AppState>()((set, get) => ({
  ...bootWs,
  users: boot.users,
  currentUser: boot.currentUser,
  remoteUnauthorized: false,
  serverOk: true,

  signUp: async (name, email, password) => {
    if (get().users.some(u => u.email === email)) return 'An account with this email already exists.'
    if (password.length < 6) return 'Password must be at least 6 characters.'
    const passwordHash = await hashPassword(password, email)
    const prev = get()
    if (prev.currentUser) persistNow(prev) // flush the outgoing user's workspace
    set({
      ...freshWorkspace(),
      users: [...prev.users, { name, email, passwordHash }],
      currentUser: email,
      profile: { ...emptyProfile, name, email }
    })
    AuditLogger.info('USER', `Account created: ${email}`, 'Fresh isolated paper workspace initialized.')
    persistNow(get())
    return null
  },

  logIn: async (email, password) => {
    const u = get().users.find(x => x.email === email)
    if (!u) return 'Invalid email or password.'
    const passwordHash = await hashPassword(password, email)
    const legacyOk = !!u.password && u.password === password
    if (u.passwordHash !== passwordHash && !legacyOk) return 'Invalid email or password.'
    const prev = get()
    if (prev.currentUser) persistNow(prev)
    // Upgrade legacy plaintext accounts to hashed on first successful login
    const users = legacyOk
      ? prev.users.map(x => x.email === email ? { name: x.name, email: x.email, passwordHash } : x)
      : prev.users
    const ws = loadWorkspace(email) ?? freshWorkspace()
    set({ ...ws, users, currentUser: email })
    AuditLogger.info('USER', `Login: ${email}`, 'Workspace loaded. Auto-trading always starts disabled on login.')
    // Safety: never resume auto-trading on login without explicit user action
    set({ autoTrading: false })
    persistNow(get())
    return null
  },

  logOut: () => {
    const s = get()
    if (s.currentUser) persistNow(s)
    // Clear the in-memory workspace so nothing leaks to the login screen or next user
    set({ ...freshWorkspace(), users: s.users, currentUser: null })
  },

  saveProfile: p => set(s => ({ profile: { ...s.profile, ...p } })),

  updateSettings: p => {
    set(s => ({ settings: { ...s.settings, ...p } }))
    AuditLogger.info('USER', 'Risk settings updated', JSON.stringify(p))
  },
  setAutoTrading: v => {
    set({ autoTrading: v })
    AuditLogger.info('USER', v ? 'AI auto-trading enabled' : 'AI auto-trading disabled')
  },
  setEmergencyStop: v => {
    set({ emergencyStop: v, autoTrading: v ? false : get().autoTrading })
    AuditLogger[v ? 'warn' : 'info']('RISK', v ? 'EMERGENCY STOP engaged — all trading halted' : 'Emergency stop released')
  },
  pauseTrading: reason => {
    set({ autoPaused: true, pauseReason: reason })
    AuditLogger.warn('RISK', 'Auto-trading paused by risk engine', reason)
  },
  resumeTrading: () => {
    set({ autoPaused: false, pauseReason: '' })
    AuditLogger.info('USER', 'Auto-trading resumed by user after risk pause')
  },
  setSpeed: sp => set({ speed: sp }),
  requestLive: () => {
    set({ liveRequested: true })
    AuditLogger.info('USER', 'Live trading unlock requested — pending compliance review and admin approval')
  },
  setLiveUnlocked: v => set({ liveUnlocked: v }),

  setMarket: (assets, intel, regime) => set({ assets, intel, regime }),
  setEngineStatus: (mode, note, confidence) => set({ engineMode: mode, engineNote: note, lastConfidence: confidence }),
  setAssetSources: m => set({ assetSources: m }),

  setCash: v => set({ cash: v }),
  rollDay: equity => set({ dayStamp: new Date().toDateString(), dayStartEquity: equity }),
  setPeak: v => set({ peakEquity: v }),
  addTrade: t => set(s => ({ trades: [t, ...s.trades].slice(0, 400) })),
  patchTrade: (id, patch) => set(s => ({ trades: s.trades.map(t => t.id === id ? { ...t, ...patch } : t) })),
  addPosition: p => set(s => ({ positions: [...s.positions, p] })),
  patchPosition: (tradeId, patch) => set(s => ({ positions: s.positions.map(p => p.tradeId === tradeId ? { ...p, ...patch } : p) })),
  removePosition: tradeId => set(s => ({ positions: s.positions.filter(p => p.tradeId !== tradeId) })),
  pushPerf: p => set(s => ({ perf: [...s.perf, p].slice(-600) })),

  addAudit: e => set(s => ({ audit: [e, ...s.audit].slice(0, 800) })),

  setBrokerConn: (id, patch) => set(s => ({ brokerConn: { ...s.brokerConn, [id]: { ...s.brokerConn[id], ...patch } } })),
  setBrokerConfig: (id, cfg) => {
    set(s => ({ brokerConfig: { ...s.brokerConfig, [id]: cfg } }))
    AuditLogger.info('BROKER', `${id.toUpperCase()} API configuration ${cfg ? 'saved' : 'cleared'}`,
      'Credentials are stored only in this browser (localStorage) and sent only to the broker\'s own API endpoint.')
  },
  setMarketKey: (provider, key) => {
    set(s => ({ marketKeys: { ...s.marketKeys, [provider]: key } }))
    AuditLogger.info('MARKET', `${provider} market-data key ${key ? 'saved' : 'cleared'} (stored locally)`)
  },
  addCustomFeed: f => {
    set(s => ({ customFeeds: [...s.customFeeds.filter(x => x.id !== f.id), f] }))
    AuditLogger.info('MARKET', `Custom price feed added: ${f.name} → ${f.symbol}`, 'Feed URL and optional auth header stored only in this browser.')
  },
  removeCustomFeed: id => {
    set(s => ({ customFeeds: s.customFeeds.filter(x => x.id !== id) }))
    AuditLogger.info('MARKET', 'Custom price feed removed')
  },
  setBrokerPortfolio: p => set({ brokerPortfolio: p }),
  setTheme: t => set({ theme: t }),
  setLiveDataOnly: v => {
    set({ liveDataOnly: v })
    AuditLogger.info('USER', v ? 'Live-data-only trading enabled — simulated-price assets excluded from trading' : 'Simulated-price assets allowed for trading (demo mode)')
  },
  setFirstLiveOrderAuthorized: v => {
    set({ firstLiveOrderAuthorized: v })
    AuditLogger[v ? 'warn' : 'info']('USER', v ? 'First live order pre-authorized by user' : 'Live order pre-authorization revoked')
  },
  setTradingMode: m => {
    // Rebase daily-loss / drawdown baselines to the new mode's equity basis —
    // otherwise the paper↔live equity jump would instantly trip the guards.
    const s = get()
    const basis = m === 'live' && s.brokerPortfolio && s.brokerPortfolio.totalUsd > 0
      ? s.brokerPortfolio.totalUsd
      : computeEquity({ cash: s.cash, positions: s.positions, assets: s.assets })
    // Rebasing invalidates any pause computed against the OLD baselines —
    // clear it so a phantom breach can't outlive the basis switch.
    set({ tradingMode: m, dayStartEquity: basis, peakEquity: basis, dayStamp: new Date().toDateString(), autoPaused: false, pauseReason: '' })
    AuditLogger[m === 'live' ? 'warn' : 'info']('USER',
      m === 'live' ? 'Trading mode switched to LIVE' : 'Trading mode switched to PAPER',
      `Risk baselines rebased to ${basis.toFixed(2)} USD (${m === 'live' ? 'real account' : 'paper ledger'}).`)
  },

  setKillSwitch: v => {
    set({ killSwitch: v })
    AuditLogger[v ? 'error' : 'info']('ADMIN', v ? 'PLATFORM KILL SWITCH ENGAGED — all automated trading halted' : 'Platform kill switch released')
  },
  setAdminApprovedLive: v => {
    set({ adminApprovedLive: v })
    AuditLogger.info('ADMIN', v ? 'Admin approved live trading request' : 'Admin revoked live trading approval')
  },

  resetDemo: () => set({
    cash: START_CASH, dayStartEquity: START_CASH, peakEquity: START_CASH,
    dayStamp: new Date().toDateString(), positions: [], trades: [], perf: [], audit: [],
    autoTrading: false, emergencyStop: false, autoPaused: false, pauseReason: '',
    engineMode: 'Cash / Risk-Off', engineNote: 'Engine reset.', lastConfidence: 0
  })
}))

// Route every AuditLogger event into the store
AuditLogger.attach(e => useStore.getState().addAudit(e))

// Throttled persistence: flush at most once per second
let saveTimer: ReturnType<typeof setTimeout> | null = null
useStore.subscribe(() => {
  if (saveTimer) return
  saveTimer = setTimeout(() => { saveTimer = null; persistNow(useStore.getState()) }, 1000)
})

// ---------- derived helpers ----------
export function positionValue(p: Position, price: number): number {
  if (p.direction === 'Long') return p.qty * price
  return Math.max(0, p.qty * (2 * p.entryPrice - price)) // fully collateralized short
}

export function positionPnl(p: Position, price: number): number {
  return p.direction === 'Long' ? p.qty * (price - p.entryPrice) : p.qty * (p.entryPrice - price)
}

export function computeEquity(s: Pick<AppState, 'cash' | 'positions' | 'assets'>): number {
  const priceOf = (sym: string) => s.assets.find(a => a.symbol === sym)?.price ?? 0
  return s.cash + s.positions.reduce((acc, p) => acc + positionValue(p, priceOf(p.symbol)), 0)
}

// ---------- empirical confidence calibration ----------
// The engine's displayed "confidence" is a heuristic score, NOT a probability.
// These helpers make it honest by reporting the REALIZED win rate of the user's
// own closed trades, bucketed by the confidence they carried at entry.
export const CONF_BUCKETS: [number, number][] = [[50, 59], [60, 69], [70, 79], [80, 89], [90, 95]]
export interface ConfBucket { lo: number; hi: number; n: number; wins: number; winRate: number | null; avgPnl: number | null }

export function confidenceCalibration(trades: Trade[]): ConfBucket[] {
  const closed = trades.filter(t => t.status === 'Closed')
  return CONF_BUCKETS.map(([lo, hi]) => {
    const b = closed.filter(t => t.confidence >= lo && t.confidence <= hi)
    const wins = b.filter(t => t.pnl > 0).length
    return { lo, hi, n: b.length, wins, winRate: b.length ? (wins / b.length) * 100 : null, avgPnl: b.length ? b.reduce((a, t) => a + t.pnl, 0) / b.length : null }
  })
}

/** Realized win rate of closed trades in the same confidence bucket as `confidence`. */
export function realizedWinRateFor(confidence: number, trades: Trade[]): { winRate: number | null; n: number } {
  const bucket = CONF_BUCKETS.find(([lo, hi]) => confidence >= lo && confidence <= hi)
  if (!bucket) return { winRate: null, n: 0 }
  const closed = trades.filter(t => t.status === 'Closed' && t.confidence >= bucket[0] && t.confidence <= bucket[1])
  const wins = closed.filter(t => t.pnl > 0).length
  return { winRate: closed.length ? (wins / closed.length) * 100 : null, n: closed.length }
}
