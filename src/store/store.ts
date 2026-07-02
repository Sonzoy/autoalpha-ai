import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AssetState, AuditEvent, BrokerConnState, BrokerId, IntelSnapshot, PerfPoint,
  Position, Regime, RiskSettings, SimSpeed, StrategyName, Trade, TradingMode, UserProfile
} from '../types'
import { RISK_DEFAULTS } from '../types'
import { AuditLogger } from '../engine/AuditLogger'

export const START_CASH = 100_000

interface StoredUser { name: string; email: string; password: string }

const emptyProfile: UserProfile = {
  name: '', email: '', experience: '', riskProfile: 'Balanced',
  markets: ['Stocks', 'ETFs'], broker: 'paper',
  riskAcknowledged: false, autoTradeConsent: false, onboarded: false
}

const initialBrokerConn = (): Record<BrokerId, BrokerConnState> => ({
  paper: { status: 'disconnected', message: 'Not initialized', lastSync: null, permissions: [], healthy: false },
  ibkr: { status: 'disconnected', message: 'Not connected', lastSync: null, permissions: [], healthy: false },
  etoro: { status: 'disconnected', message: 'Not connected', lastSync: null, permissions: [], healthy: false }
})

export interface AppState {
  // ---- auth ----
  users: StoredUser[]
  currentUser: string | null
  profile: UserProfile
  signUp: (name: string, email: string, password: string) => string | null
  logIn: (email: string, password: string) => string | null
  logOut: () => void
  saveProfile: (p: Partial<UserProfile>) => void

  // ---- engine controls ----
  settings: RiskSettings
  autoTrading: boolean
  emergencyStop: boolean
  autoPaused: boolean
  pauseReason: string
  tradingMode: TradingMode
  liveUnlocked: boolean
  liveRequested: boolean
  speed: SimSpeed
  updateSettings: (s: Partial<RiskSettings>) => void
  setAutoTrading: (v: boolean) => void
  setEmergencyStop: (v: boolean) => void
  pauseTrading: (reason: string) => void
  resumeTrading: () => void
  setSpeed: (s: SimSpeed) => void
  requestLive: () => void
  setLiveUnlocked: (v: boolean) => void

  // ---- market mirror (written by TradingEngine each tick) ----
  assets: AssetState[]
  intel: Record<string, IntelSnapshot>
  regime: Regime
  engineMode: StrategyName
  engineNote: string
  lastConfidence: number
  setMarket: (assets: AssetState[], intel: Record<string, IntelSnapshot>, regime: Regime) => void
  setEngineStatus: (mode: StrategyName, note: string, confidence: number) => void

  // ---- portfolio ----
  cash: number
  dayStartEquity: number
  peakEquity: number
  dayStamp: string
  positions: Position[]
  trades: Trade[]
  perf: PerfPoint[]
  setCash: (v: number) => void
  rollDay: (equity: number) => void
  setPeak: (v: number) => void
  addTrade: (t: Trade) => void
  patchTrade: (id: string, patch: Partial<Trade>) => void
  addPosition: (p: Position) => void
  patchPosition: (tradeId: string, patch: Partial<Position>) => void
  removePosition: (tradeId: string) => void
  pushPerf: (p: PerfPoint) => void

  // ---- audit ----
  audit: AuditEvent[]
  addAudit: (e: AuditEvent) => void

  // ---- brokers ----
  brokerConn: Record<BrokerId, BrokerConnState>
  setBrokerConn: (id: BrokerId, patch: Partial<BrokerConnState>) => void

  // ---- admin ----
  killSwitch: boolean
  adminApprovedLive: boolean
  setKillSwitch: (v: boolean) => void
  setAdminApprovedLive: (v: boolean) => void

  resetDemo: () => void
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      users: [],
      currentUser: null,
      profile: emptyProfile,

      signUp: (name, email, password) => {
        if (get().users.some(u => u.email === email)) return 'An account with this email already exists.'
        if (password.length < 6) return 'Password must be at least 6 characters.'
        set(s => ({ users: [...s.users, { name, email, password }], currentUser: email, profile: { ...emptyProfile, name, email } }))
        AuditLogger.info('USER', `Account created: ${email}`)
        return null
      },
      logIn: (email, password) => {
        const u = get().users.find(x => x.email === email)
        if (!u || u.password !== password) return 'Invalid email or password.'
        set({ currentUser: email })
        AuditLogger.info('USER', `Login: ${email}`)
        return null
      },
      logOut: () => set({ currentUser: null }),
      saveProfile: p => set(s => ({ profile: { ...s.profile, ...p } })),

      settings: RISK_DEFAULTS.Balanced,
      autoTrading: false,
      emergencyStop: false,
      autoPaused: false,
      pauseReason: '',
      tradingMode: 'paper',
      liveUnlocked: false,
      liveRequested: false,
      speed: 10,
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

      assets: [],
      intel: {},
      regime: 'Ranging',
      engineMode: 'Cash / Risk-Off',
      engineNote: 'Engine idle.',
      lastConfidence: 0,
      setMarket: (assets, intel, regime) => set({ assets, intel, regime }),
      setEngineStatus: (mode, note, confidence) => set({ engineMode: mode, engineNote: note, lastConfidence: confidence }),

      cash: START_CASH,
      dayStartEquity: START_CASH,
      peakEquity: START_CASH,
      dayStamp: new Date().toDateString(),
      positions: [],
      trades: [],
      perf: [],
      setCash: v => set({ cash: v }),
      rollDay: equity => set({ dayStamp: new Date().toDateString(), dayStartEquity: equity }),
      setPeak: v => set({ peakEquity: v }),
      addTrade: t => set(s => ({ trades: [t, ...s.trades].slice(0, 400) })),
      patchTrade: (id, patch) => set(s => ({ trades: s.trades.map(t => t.id === id ? { ...t, ...patch } : t) })),
      addPosition: p => set(s => ({ positions: [...s.positions, p] })),
      patchPosition: (tradeId, patch) => set(s => ({ positions: s.positions.map(p => p.tradeId === tradeId ? { ...p, ...patch } : p) })),
      removePosition: tradeId => set(s => ({ positions: s.positions.filter(p => p.tradeId !== tradeId) })),
      pushPerf: p => set(s => ({ perf: [...s.perf, p].slice(-600) })),

      audit: [],
      addAudit: e => set(s => ({ audit: [e, ...s.audit].slice(0, 800) })),

      brokerConn: initialBrokerConn(),
      setBrokerConn: (id, patch) => set(s => ({ brokerConn: { ...s.brokerConn, [id]: { ...s.brokerConn[id], ...patch } } })),

      killSwitch: false,
      adminApprovedLive: false,
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
    }),
    {
      name: 'autoalpha-ai',
      partialize: s => ({
        users: s.users, currentUser: s.currentUser, profile: s.profile,
        settings: s.settings, autoTrading: s.autoTrading, emergencyStop: s.emergencyStop,
        autoPaused: s.autoPaused, pauseReason: s.pauseReason, tradingMode: s.tradingMode,
        liveUnlocked: s.liveUnlocked, liveRequested: s.liveRequested, speed: s.speed,
        assets: s.assets, cash: s.cash, dayStartEquity: s.dayStartEquity, peakEquity: s.peakEquity,
        dayStamp: s.dayStamp, positions: s.positions, trades: s.trades, perf: s.perf,
        audit: s.audit.slice(0, 300), brokerConn: s.brokerConn,
        killSwitch: s.killSwitch, adminApprovedLive: s.adminApprovedLive
      })
    }
  )
)

// Route every AuditLogger event into the store
AuditLogger.attach(e => useStore.getState().addAudit(e))

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
