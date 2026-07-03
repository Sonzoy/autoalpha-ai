// ---------- Core domain types for AutoAlpha AI ----------

export type RiskProfile = 'Conservative' | 'Balanced' | 'Aggressive'
export type Market = 'Crypto' | 'Stocks' | 'ETFs' | 'Forex' | 'Commodities'
export type Regime = 'Trending' | 'Ranging' | 'Volatile' | 'Risk-Off'
export type StrategyName =
  | 'Trend Momentum'
  | 'Mean Reversion'
  | 'Sentiment Driven'
  | 'Defensive Hedge'
  | 'Cash / Risk-Off'
export type Direction = 'Long' | 'Short'
export type OrderStatus = 'Proposed' | 'Approved' | 'Submitted' | 'Filled' | 'Rejected' | 'Closed'
export type BrokerId = 'paper' | 'ibkr' | 'etoro' | 'binance'
export type BrokerStatus = 'disconnected' | 'connecting' | 'connected' | 'error'
export type TradingMode = 'paper' | 'live'
export type SimSpeed = 1 | 10 | 60

export interface AssetDef {
  symbol: string
  name: string
  market: Market
  basePrice: number
  vol: number // annualized volatility, e.g. 0.6 for BTC
  decimals: number
}

export interface AssetState {
  symbol: string
  name: string
  market: Market
  price: number
  prevPrice: number
  dayOpen: number
  history: number[] // recent closes, capped
  vol: number
  decimals: number
}

export interface IntelSnapshot {
  symbol: string
  live?: boolean // scores computed from live 30s bars vs simulated bars
  trend: number //  -100..100
  volatility: number // 0..100
  newsSentiment: number // -100..100
  socialSentiment: number // -100..100
  liquidity: number // 0..100
  volumeAnomaly: number // 0..100
  macroRisk: number // 0..100 (global)
  regime: Regime
}

export interface StrategySignal {
  strategy: StrategyName
  direction: Direction
  score: number // 0..100 conviction
  rationale: string
}

export interface TradeProposal {
  symbol: string
  market: Market
  direction: Direction
  strategy: StrategyName
  confidence: number // 0..100
  allocationPct: number // % of equity
  stopLossPct: number
  takeProfitPct: number
  rationale: string
  regime: Regime
}

export interface RiskCheck {
  name: string
  passed: boolean
  detail: string
}

export interface RiskDecision {
  approved: boolean
  checks: RiskCheck[]
  summary: string
}

export interface Trade {
  id: string
  symbol: string
  market: Market
  broker: BrokerId
  direction: Direction
  entryPrice: number
  exitPrice?: number
  qty: number
  stopLoss: number
  takeProfit: number
  pnl: number
  strategy: StrategyName
  confidence: number
  status: OrderStatus
  rationale: string
  riskChecks: RiskCheck[]
  regime: Regime
  openedAt: number
  closedAt?: number
  closeReason?: string
}

export interface Position {
  tradeId: string
  symbol: string
  market: Market
  direction: Direction
  qty: number
  entryPrice: number
  stopLoss: number
  takeProfit: number
  trailingStop?: number
  strategy: StrategyName
  confidence: number
  openedAt: number
}

export type AuditCategory = 'MARKET' | 'STRATEGY' | 'RISK' | 'ORDER' | 'BROKER' | 'SYSTEM' | 'USER' | 'ADMIN'
export type AuditSeverity = 'info' | 'warn' | 'error'

export interface AuditEvent {
  id: string
  ts: number
  category: AuditCategory
  severity: AuditSeverity
  message: string
  detail?: string
}

export interface RiskSettings {
  maxAllocationPct: number
  stopLossPct: number
  takeProfitPct: number
  dailyLossLimitPct: number
  maxDrawdownPct: number
  minTradeUsd: number // orders below this value are skipped (dust protection)
  stopLossEnabled: boolean
  takeProfitEnabled: boolean
  trailingStopEnabled: boolean
}

export interface UserProfile {
  name: string
  email: string
  experience: 'Beginner' | 'Intermediate' | 'Advanced' | ''
  riskProfile: RiskProfile
  markets: Market[]
  broker: BrokerId
  riskAcknowledged: boolean
  autoTradeConsent: boolean
  onboarded: boolean
}

export interface PerfPoint {
  ts: number
  equity: number
  drawdown: number // negative percent, e.g. -3.2
  dailyPnl: number
  live?: boolean // true when equity is the REAL broker account value
}

export interface BrokerConnState {
  status: BrokerStatus
  message: string
  lastSync: number | null
  permissions: string[]
  healthy: boolean
}

export type PriceSource = 'binance' | 'coingecko' | 'frankfurter' | 'finnhub' | 'broker' | 'custom' | 'simulated'

export type ThemeMode = 'dark' | 'light'

/** User-defined live price feed for any platform/provider. */
export interface CustomFeed {
  id: string
  name: string       // e.g. "Binance BTC"
  symbol: string     // which asset this feeds, e.g. "BTC/USD"
  url: string        // endpoint returning JSON with the price
  jsonPath: string   // dot-path to the price in the response, e.g. "price" or "data.last"
  headerName?: string  // optional auth header (keys never go in URLs)
  headerValue?: string
}

export interface IbkrConfig {
  gatewayUrl: string // e.g. https://localhost:5000/v1/api (IBKR Client Portal Gateway)
  accountId: string
}

export interface EtoroConfig {
  username: string
  apiKey: string
}

export interface BinanceConfig {
  apiKey: string
  apiSecret: string
}

/** Snapshot of the REAL account at a connected broker (authoritative). */
export interface BrokerPortfolio {
  broker: BrokerId
  totalUsd: number
  syncedAt: number
  balances: { asset: string; qty: number; usd: number | null }[]
}

export const RISK_DEFAULTS: Record<RiskProfile, RiskSettings> = {
  Conservative: {
    maxAllocationPct: 2, stopLossPct: 1, takeProfitPct: 2,
    dailyLossLimitPct: 2, maxDrawdownPct: 5, minTradeUsd: 15,
    stopLossEnabled: true, takeProfitEnabled: true, trailingStopEnabled: false
  },
  Balanced: {
    maxAllocationPct: 5, stopLossPct: 2, takeProfitPct: 4,
    dailyLossLimitPct: 4, maxDrawdownPct: 10, minTradeUsd: 15,
    stopLossEnabled: true, takeProfitEnabled: true, trailingStopEnabled: true
  },
  Aggressive: {
    maxAllocationPct: 10, stopLossPct: 4, takeProfitPct: 8,
    dailyLossLimitPct: 8, maxDrawdownPct: 18, minTradeUsd: 15,
    stopLossEnabled: true, takeProfitEnabled: true, trailingStopEnabled: true
  }
}

export const DISCLAIMER_SHORT =
  'Automated trading involves risk and losses are possible. Past performance does not guarantee future results. Not financial advice.'

export const LIVE_LOCK_MESSAGE =
  'Live trading requires broker connection, trading permissions, compliance review, and explicit user authorization.'
