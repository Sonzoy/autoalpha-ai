/**
 * Backtest core — shared by run.ts (single run) and optimize.ts (walk-forward).
 *
 * Runs the REAL strategy + selector code (imported from src/, no copies) over
 * historical 5-minute closes, replicating the engine's exact intel computation
 * (MarketSimulator.computeIntel, live path) and exit rules (TradingEngine).
 * Long-only, Binance-style commission per side.
 *
 * Backtests/optimizations are simulations of past data — not predictions and
 * not a guarantee of future results.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { StrategySelector } from '../src/engine/strategies/StrategySelector'
import { detectRegime } from '../src/engine/MarketSimulator'
import type { AssetState, IntelSnapshot, Position, RiskSettings } from '../src/types'
import { RISK_DEFAULTS } from '../src/types'

export const HERE = path.dirname(fileURLToPath(import.meta.url))
export const COMMISSION_PER_SIDE = 0.001 // Binance spot 0.1%
export const MACRO_RISK = 35             // baseline; no real macro series exists in price data
export const WARMUP = 41
export const SYMBOLS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'DOGE/USD', 'XRP/USD', 'AVAX/USD', 'LINK/USD', 'ADA/USD']
const BINANCE_PAIR: Record<string, string> = {
  'BTC/USD': 'BTCUSDT', 'ETH/USD': 'ETHUSDT', 'SOL/USD': 'SOLUSDT', 'DOGE/USD': 'DOGEUSDT',
  'XRP/USD': 'XRPUSDT', 'AVAX/USD': 'AVAXUSDT', 'LINK/USD': 'LINKUSDT', 'ADA/USD': 'ADAUSDT'
}
const DEFAULT_VOLS: Record<string, number> = {
  'BTC/USD': 0.55, 'ETH/USD': 0.65, 'SOL/USD': 0.85, 'DOGE/USD': 1.05,
  'XRP/USD': 0.9, 'AVAX/USD': 1.0, 'LINK/USD': 0.95, 'ADA/USD': 0.9
}

export interface Params {
  stopLossPct: number
  takeProfitPct: number
  minConfidence: number   // extra gate on top of the selector's own 50-floor
  maxHoldBars: number
  entryCooldown: number
  trailing: boolean
  /** Exit-geometry knobs (defaults = current LIVE engine behavior). */
  useProposalExits: boolean // per-trade vol-scaled stop/TP from the selector (live behavior)
  volCapStop: number        // cap on the selector's volFactor applied in-sim (2 = live's cap)
  trailArmFrac: number      // arm trail at trailArmFrac × stop distance in profit (1 = live)
  trailDistFrac: number     // trail by trailDistFrac × stop distance once armed (1 = live)
  beFloorPct: number        // armed trail never below entry×(1+beFloorPct/100) (0.3 = live)
}
export const BALANCED_PARAMS: Params = {
  stopLossPct: RISK_DEFAULTS.Balanced.stopLossPct,
  takeProfitPct: RISK_DEFAULTS.Balanced.takeProfitPct,
  minConfidence: 50, maxHoldBars: 48, entryCooldown: 5,
  trailing: RISK_DEFAULTS.Balanced.trailingStopEnabled,
  useProposalExits: true, volCapStop: 2, trailArmFrac: 1, trailDistFrac: 1, beFloorPct: 0.3
}

export interface Trade { symbol: string; confidence: number; entry: number; exit: number; grossPct: number; netPct: number; win: boolean; bars: number; reason: string; bar: number }
export type Data = Record<string, { vol: number; history: number[] }>

// ---------- math (verbatim from MarketSimulator) ----------
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const round1 = (x: number) => Math.round(x * 10) / 10
function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}
interface Sent { news: number; social: number }

/** Faithful reproduction of MarketSimulator.computeIntel (live path), noise→0. */
function computeIntel(sym: string, h: number[], vol: number, s: Sent): IntelSnapshot {
  const n = h.length
  const look = Math.min(40, n - 1)
  const mom = look > 0 ? (h[n - 1] - h[n - 1 - look]) / h[n - 1 - look] : 0
  const rets: number[] = []
  for (let i = Math.max(1, n - 30); i < n; i++) rets.push(Math.log(h[i] / h[i - 1]))
  const sd = stdev(rets)
  const volScore = clamp((sd / (vol * 0.0031)) * 45, 3, 100)
  const trend = clamp(mom * 4000, -100, 100)
  const liquidity = clamp(88 - MACRO_RISK * 0.25 - volScore * 0.15, 20, 98)
  const volumeAnomaly = clamp(volScore * 0.5 + Math.abs(trend) * 0.2, 0, 100)
  return {
    symbol: sym, live: true, trend: round1(trend), volatility: round1(volScore),
    newsSentiment: round1(s.news), socialSentiment: round1(s.social),
    liquidity: round1(liquidity), volumeAnomaly: round1(volumeAnomaly),
    macroRisk: MACRO_RISK, regime: detectRegime(trend, volScore, MACRO_RISK, s.news)
  }
}
function evolveSent(s: Sent, barRet: number): void {
  s.news = clamp(s.news * 0.96 + barRet * 1800, -95, 95)
  s.social = clamp(s.social * 0.93 + s.news * 0.06 + barRet * 2200, -95, 95)
}

/**
 * Simulate over bars. Sentiment/positions warm up from WARMUP; a trade is only
 * ENTERED when its bar is within [entryFrom, entryTo) — this lets the optimizer
 * evaluate a parameter set on a specific out-of-sample window while keeping
 * state continuous. Positions opened in-window are allowed to close normally.
 */
export function simulate(data: Data, p: Params, entryFrom = WARMUP, entryTo = Infinity): Trade[] {
  const series = SYMBOLS.filter(s => data[s]?.history?.length >= 45)
  const maxLen = Math.max(...series.map(s => data[s].history.length))
  const sent: Record<string, Sent> = Object.fromEntries(series.map(s => [s, { news: 0, social: 0 }]))
  const pos: Record<string, (Position & { openedBar: number; entry: number }) | null> = {}
  const trades: Trade[] = []
  let cooldown = 0

  for (let bar = WARMUP; bar < maxLen; bar++) {
    const assets: AssetState[] = []
    const intel: Record<string, IntelSnapshot> = {}
    for (const sym of series) {
      const full = data[sym].history
      if (bar >= full.length) continue
      const hist = full.slice(0, bar + 1).slice(-160)
      const barRet = hist.length > 1 ? (hist[hist.length - 1] - hist[hist.length - 2]) / hist[hist.length - 2] : 0
      evolveSent(sent[sym], barRet)
      const price = hist[hist.length - 1]
      assets.push({ symbol: sym, name: sym, market: 'Crypto', price, prevPrice: hist[hist.length - 2] ?? price, dayOpen: hist[Math.max(0, hist.length - 24)], history: hist, vol: data[sym].vol, decimals: 2 })
      intel[sym] = computeIntel(sym, hist, data[sym].vol, sent[sym])
    }

    // manage open positions — MIRRORS TradingEngine.ts exactly:
    // trail by the position's own stop distance, arm at trailArmFrac × that
    // distance in profit, armed trail floored at breakeven + fees.
    for (const sym of series) {
      const pp = pos[sym]; if (!pp) continue
      const price = assets.find(a => a.symbol === sym)?.price; if (!price) continue
      if (p.trailing) {
        const stopDist = (pp.entry - pp.stopLoss) / pp.entry
        const beFloor = pp.entry * (1 + p.beFloorPct / 100)
        if (stopDist > 0 && price >= pp.entry * (1 + stopDist * p.trailArmFrac)) {
          const raw = price * (1 - stopDist * p.trailDistFrac)
          const trail = Math.max(raw, beFloor)
          if (pp.trailingStop === undefined || trail > pp.trailingStop) pp.trailingStop = trail
        }
      }
      const effStop = (p.trailing ? pp.trailingStop : undefined) ?? pp.stopLoss
      let reason: string | null = null
      if (price <= effStop) reason = pp.trailingStop !== undefined && effStop === pp.trailingStop ? 'Trail' : 'Stop'
      else if (price >= pp.takeProfit) reason = 'Target'
      else if (bar - pp.openedBar >= p.maxHoldBars) reason = 'Max-hold'
      if (reason) {
        const grossPct = ((price - pp.entry) / pp.entry) * 100
        const netPct = grossPct - COMMISSION_PER_SIDE * 200
        trades.push({ symbol: sym, confidence: pp.confidence, entry: pp.entry, exit: price, grossPct, netPct, win: netPct > 0, bars: bar - pp.openedBar, reason, bar: pp.openedBar })
        pos[sym] = null
      }
    }

    // propose a new long entry, within the entry window + cooldown
    if (cooldown > 0) { cooldown--; continue }
    if (bar < entryFrom || bar >= entryTo) continue
    const held: Position[] = series.filter(s => pos[s]).map(s => ({ ...(pos[s]!) } as Position))
    const sel = StrategySelector.select(assets, intel, { markets: ['Crypto'], riskProfile: 'Balanced', settings: RISK_DEFAULTS.Balanced as RiskSettings, positions: held, longOnly: true })
    const prop = sel.proposal
    if (!prop || prop.direction !== 'Long' || pos[prop.symbol] || prop.confidence < p.minConfidence) continue
    const price = assets.find(a => a.symbol === prop.symbol)!.price
    // Exit distances: live engine uses the selector's vol-scaled per-trade
    // percentages (prop.stopLossPct/takeProfitPct). volCapStop lets variants
    // re-cap the scaling without touching src/. R:R ratio is preserved.
    let slPct = p.stopLossPct, tpPct = p.takeProfitPct
    if (p.useProposalExits) {
      const impliedFactor = prop.stopLossPct / RISK_DEFAULTS.Balanced.stopLossPct
      const f = Math.min(impliedFactor, p.volCapStop)
      slPct = RISK_DEFAULTS.Balanced.stopLossPct * f
      tpPct = RISK_DEFAULTS.Balanced.takeProfitPct * f
    }
    pos[prop.symbol] = {
      tradeId: `bt-${bar}`, symbol: prop.symbol, market: 'Crypto', direction: 'Long', qty: 1,
      entryPrice: price, entry: price, openedBar: bar,
      stopLoss: price * (1 - slPct / 100), takeProfit: price * (1 + tpPct / 100),
      strategy: prop.strategy, confidence: prop.confidence, openedAt: bar
    }
    cooldown = p.entryCooldown
  }
  return trades
}

export interface Summary { n: number; wins: number; winRate: number; avgNet: number; avgGross: number; compounded: number; expectancy: number }
export function summarize(trades: Trade[]): Summary {
  const n = trades.length
  if (!n) return { n: 0, wins: 0, winRate: 0, avgNet: 0, avgGross: 0, compounded: 0, expectancy: 0 }
  const wins = trades.filter(t => t.win).length
  const avgNet = trades.reduce((a, t) => a + t.netPct, 0) / n
  const avgGross = trades.reduce((a, t) => a + t.grossPct, 0) / n
  const compounded = (trades.reduce((a, t) => a * (1 + t.netPct / 100), 1) - 1) * 100
  return { n, wins, winRate: (wins / n) * 100, avgNet, avgGross, compounded, expectancy: avgNet }
}

export const CONF_BUCKETS: [number, number][] = [[50, 59], [60, 69], [70, 79], [80, 89], [90, 95]]
export function calibration(trades: Trade[]) {
  return CONF_BUCKETS.map(([lo, hi]) => {
    const b = trades.filter(t => t.confidence >= lo && t.confidence <= hi)
    const w = b.filter(t => t.win).length
    return { lo, hi, n: b.length, winRate: b.length ? (w / b.length) * 100 : null, avgNet: b.length ? b.reduce((a, t) => a + t.netPct, 0) / b.length : null }
  })
}
export function pearson(xs: number[], ys: number[]): number {
  const n = xs.length; if (!n) return 0
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0, dx = 0, dy = 0
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2 }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0
}

/** Load data: local real-history.json, or `--fetch <days>` from Binance klines. */
export async function loadData(): Promise<Data> {
  const fetchIdx = process.argv.indexOf('--fetch')
  if (fetchIdx === -1) {
    const j = JSON.parse(fs.readFileSync(path.join(HERE, 'real-history.json'), 'utf8'))
    console.log(`Loaded local real-history.json (${Object.keys(j).map(k => `${k}:${j[k].history.length}`).join('  ')})`)
    return j
  }
  const days = Number(process.argv[fetchIdx + 1] || 14)
  const out: Data = {}
  const barsWanted = Math.ceil((days * 24 * 60) / 5)
  for (const sym of SYMBOLS) {
    const pair = BINANCE_PAIR[sym]
    const closes: number[] = []
    let end = Date.now()
    while (closes.length < barsWanted) {
      const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${pair}&interval=5m&limit=1000&endTime=${end}`)
      const rows: any[] = await r.json()
      if (!Array.isArray(rows) || rows.length === 0) break
      closes.unshift(...rows.map(k => Number(k[4])))
      end = rows[0][0] - 1
      if (rows.length < 1000) break
    }
    out[sym] = { vol: DEFAULT_VOLS[sym], history: closes.slice(-barsWanted) }
    console.log(`Fetched ${sym}: ${out[sym].history.length} bars from Binance`)
  }
  // Cache so subsequent runs/variants compare on IDENTICAL data
  fs.writeFileSync(path.join(HERE, 'real-history.json'), JSON.stringify(out))
  return out
}
