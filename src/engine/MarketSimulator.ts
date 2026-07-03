import type { AssetDef, AssetState, IntelSnapshot, Regime } from '../types'
import { ASSET_UNIVERSE } from '../data/assets'

/**
 * MarketSimulator — generates realistic simulated market data when real
 * market-data APIs are unavailable. Geometric-Brownian price paths with
 * regime-dependent drift/volatility multipliers, occasional jumps, and
 * mean-reverting sentiment series loosely coupled to price action.
 * Outcomes are genuinely random: both winning and losing trades occur.
 */

const HISTORY_CAP = 160

interface SentimentState { news: number; social: number }

export class MarketSimulator {
  assets: AssetState[] = []
  intel: Record<string, IntelSnapshot> = {}
  macroRisk = 35 // 0..100 global slow-moving risk factor
  liveSymbols = new Set<string>() // assets currently driven by live feeds (GBM skipped)
  private sentiment: Record<string, SentimentState> = {}
  private driftBias: Record<string, number> = {} // slow-moving per-asset drift regime
  private anchors: Record<string, number> = {} // long-run anchor to stop unrealistic drift

  constructor(seedAssets?: AssetState[]) {
    if (seedAssets && seedAssets.length) {
      this.assets = seedAssets
    } else {
      this.assets = ASSET_UNIVERSE.map((d: AssetDef) => ({
        symbol: d.symbol, name: d.name, market: d.market,
        price: d.basePrice, prevPrice: d.basePrice, dayOpen: d.basePrice,
        history: this.warmup(d), vol: d.vol, decimals: d.decimals
      }))
    }
    for (const a of this.assets) {
      this.sentiment[a.symbol] = { news: rand(-30, 30), social: rand(-30, 30) }
      this.driftBias[a.symbol] = rand(-1, 1)
      this.anchors[a.symbol] = ASSET_UNIVERSE.find(d => d.symbol === a.symbol)?.basePrice ?? a.price
      a.history = a.history.length ? a.history : [a.price]
      this.computeIntel(a)
    }
  }

  /** Replace an asset's history with real market history (from live APIs). */
  applyLiveHistory(histories: Record<string, number[]>): void {
    for (const a of this.assets) {
      const h = histories[a.symbol]
      if (!h || h.length < 20) continue
      a.history = h.slice(-HISTORY_CAP)
      a.price = h[h.length - 1]
      a.prevPrice = h[h.length - 2] ?? a.price
      a.dayOpen = h[Math.max(0, h.length - 24)] // ~24h ago on hourly data
      this.liveSymbols.add(a.symbol)
      this.computeIntel(a)
    }
  }

  /** Apply real prices from live feeds. Live assets stop following GBM. */
  applyLiveQuotes(quotes: Record<string, { price: number }>): void {
    for (const a of this.assets) {
      const q = quotes[a.symbol]
      if (!q) continue
      this.liveSymbols.add(a.symbol)
      if (a.price !== q.price) {
        a.prevPrice = a.price
        a.price = q.price
        a.history.push(q.price)
        if (a.history.length > HISTORY_CAP) a.history.shift()
        // First live quote after a simulated run can jump: reset day open
        if (Math.abs(q.price - a.dayOpen) / a.dayOpen > 0.2) a.dayOpen = q.price
        this.computeIntel(a)
      }
    }
  }

  private warmup(d: AssetDef): number[] {
    const out: number[] = []
    let p = d.basePrice * (1 - rand(-0.04, 0.04))
    const bias = rand(-1, 1)
    for (let i = 0; i < HISTORY_CAP; i++) {
      p = gbmStep(p, d.vol, bias * 0.15, 1)
      out.push(p)
    }
    return out
  }

  /** Advance all assets one tick. Returns updated snapshots. */
  step(): void {
    // Global macro risk: slow mean-reverting walk with occasional shocks
    this.macroRisk = clamp(
      this.macroRisk + rand(-2.5, 2.5) + (Math.random() < 0.015 ? rand(8, 22) : 0) - (this.macroRisk - 40) * 0.02,
      5, 95
    )
    for (const a of this.assets) {
      // Live-fed assets: prices come from real feeds via applyLiveQuotes;
      // only sentiment/intel evolve here.
      if (this.liveSymbols.has(a.symbol)) {
        const sLive = this.sentiment[a.symbol]
        const retLive = a.prevPrice ? (a.price - a.prevPrice) / a.prevPrice : 0
        sLive.news = clamp(sLive.news * 0.97 + retLive * 400 + rand(-4, 4), -95, 95)
        sLive.social = clamp(sLive.social * 0.94 + sLive.news * 0.05 + retLive * 600 + rand(-6, 6), -95, 95)
        this.computeIntel(a)
        continue
      }
      // Slowly rotate drift regimes so trends form and break
      if (Math.random() < 0.02) this.driftBias[a.symbol] = rand(-1, 1)
      const s = this.sentiment[a.symbol]
      const riskDrag = this.macroRisk > 70 ? -0.4 : 0
      // Anchor term: gentle mean reversion toward base price prevents
      // multi-hour drifts into implausible territory (e.g., gold at $1,400)
      const anchorPull = Math.log(this.anchors[a.symbol] / a.price) * 1.2
      const drift = this.driftBias[a.symbol] * 0.25 + s.news / 600 + riskDrag * 0.2 + anchorPull
      const volMult = 1 + this.macroRisk / 120 + (Math.random() < 0.03 ? 1.5 : 0)
      a.prevPrice = a.price
      a.price = gbmStep(a.price, a.vol * volMult, drift, 1)
      a.history.push(a.price)
      if (a.history.length > HISTORY_CAP) a.history.shift()

      // Sentiment: mean-reverting, nudged by recent returns, with news shocks
      const ret = (a.price - a.prevPrice) / a.prevPrice
      s.news = clamp(s.news * 0.97 + ret * 400 + rand(-4, 4) + (Math.random() < 0.02 ? rand(-40, 40) : 0), -95, 95)
      s.social = clamp(s.social * 0.94 + s.news * 0.05 + ret * 600 + rand(-6, 6), -95, 95)
      this.computeIntel(a)
    }
  }

  rollDay(): void {
    for (const a of this.assets) a.dayOpen = a.price
  }

  private computeIntel(a: AssetState): void {
    const h = a.history
    const n = h.length
    const look = Math.min(40, n - 1)
    const mom = look > 0 ? (h[n - 1] - h[n - 1 - look]) / h[n - 1 - look] : 0
    // realized vol of last 30 bars, annualized-ish then scaled to 0..100
    const rets: number[] = []
    for (let i = Math.max(1, n - 30); i < n; i++) rets.push(Math.log(h[i] / h[i - 1]))
    const sd = stdev(rets)
    // normalize by the asset's expected per-tick sigma so ~45 = normal conditions
    const volScore = clamp((sd / (a.vol * 0.045)) * 45, 3, 100)
    const trend = clamp(mom * 550, -100, 100)
    const s = this.sentiment[a.symbol]
    const liquidity = clamp(88 - this.macroRisk * 0.25 - volScore * 0.15 + rand(-3, 3), 20, 98)
    const volumeAnomaly = clamp(volScore * 0.5 + Math.abs(trend) * 0.2 + rand(0, 15), 0, 100)
    this.intel[a.symbol] = {
      symbol: a.symbol,
      trend: round1(trend),
      volatility: round1(volScore),
      newsSentiment: round1(s.news),
      socialSentiment: round1(s.social),
      liquidity: round1(liquidity),
      volumeAnomaly: round1(volumeAnomaly),
      macroRisk: round1(this.macroRisk),
      regime: detectRegime(trend, volScore, this.macroRisk, s.news)
    }
  }

  globalRegime(): Regime {
    const counts: Record<Regime, number> = { 'Trending': 0, 'Ranging': 0, 'Volatile': 0, 'Risk-Off': 0 }
    for (const k of Object.keys(this.intel)) counts[this.intel[k].regime]++
    if (this.macroRisk > 74) return 'Risk-Off'
    return (Object.entries(counts).sort((x, y) => y[1] - x[1])[0][0]) as Regime
  }
}

export function detectRegime(trend: number, vol: number, macroRisk: number, sentiment: number): Regime {
  if (macroRisk > 74 || (sentiment < -60 && vol > 55)) return 'Risk-Off'
  if (vol > 66) return 'Volatile'
  if (Math.abs(trend) > 45) return 'Trending'
  return 'Ranging'
}

// ---------- math helpers ----------
function gbmStep(p: number, annVol: number, driftAnn: number, dtHours: number): number {
  const dt = dtHours / (24 * 365)
  const sigma = annVol * Math.sqrt(dt) * 3 // scaled up so demo ticks show movement
  const mu = driftAnn * Math.sqrt(dt) * 1.5
  const z = gauss()
  return Math.max(p * Math.exp(mu - (sigma * sigma) / 2 + sigma * z), p * 0.5)
}

function gauss(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}

export function clamp(x: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, x)) }
export function rand(lo: number, hi: number): number { return lo + Math.random() * (hi - lo) }
function round1(x: number): number { return Math.round(x * 10) / 10 }
