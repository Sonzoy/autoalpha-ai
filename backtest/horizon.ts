/**
 * Long-horizon momentum walk-forward backtest (hourly bars).
 *
 * Tests the ONLY signal family that showed positive net expectancy in the
 * 30-day 5-min scan: multi-day momentum, ~daily holds. Walk-forward: grid is
 * fit on an in-sample window, evaluated on the following out-of-sample
 * window, rolled forward. Only aggregate OOS numbers matter.
 *
 *   npx tsx backtest/horizon.ts              # uses cached horizon-history.json
 *   npx tsx backtest/horizon.ts --fetch 365  # fetch N days of Binance 1h klines
 *
 * Simulations of past data — not predictions, not guarantees of future results.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FILE = path.join(HERE, 'horizon-history.json')
const FEE_RT = 0.2 // % round-trip (Binance spot 0.1%/side)
const SYMBOLS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'DOGE/USD', 'XRP/USD', 'AVAX/USD', 'LINK/USD', 'ADA/USD']
const PAIR: Record<string, string> = {
  'BTC/USD': 'BTCUSDT', 'ETH/USD': 'ETHUSDT', 'SOL/USD': 'SOLUSDT', 'DOGE/USD': 'DOGEUSDT',
  'XRP/USD': 'XRPUSDT', 'AVAX/USD': 'AVAXUSDT', 'LINK/USD': 'LINKUSDT', 'ADA/USD': 'ADAUSDT'
}

interface P { lookback: number; hold: number; threshold: number; stopPct: number; maxPositions: number }
interface T { symbol: string; entryBar: number; netPct: number; win: boolean; reason: string }
type Data = Record<string, number[]>

const GRID: P[] = []
for (const lookback of [24, 48, 72, 96])          // hours
  for (const hold of [12, 24, 48])                 // hours
    for (const threshold of [1, 2, 4])             // % momentum to enter
      GRID.push({ lookback, hold, threshold, stopPct: 5, maxPositions: 3 })
const DEFAULT: P = { lookback: 72, hold: 24, threshold: 2, stopPct: 5, maxPositions: 3 }

/** Simulate: enter long when lookback-return > threshold%, exit at stop/hold. */
function simulate(data: Data, p: P, entryFrom: number, entryTo: number): T[] {
  const maxLen = Math.max(...SYMBOLS.map(s => data[s]?.length ?? 0))
  const pos: Record<string, { entry: number; bar: number } | null> = {}
  const out: T[] = []
  for (let bar = p.lookback; bar < maxLen; bar++) {
    let open = SYMBOLS.filter(s => pos[s]).length
    for (const sym of SYMBOLS) {
      const h = data[sym]; if (!h || bar >= h.length) continue
      const pp = pos[sym]
      const price = h[bar]
      if (pp) {
        const grossPct = ((price - pp.entry) / pp.entry) * 100
        let reason: string | null = null
        if (grossPct <= -p.stopPct) reason = 'Stop'
        else if (bar - pp.bar >= p.hold) reason = 'Hold-exit'
        if (reason) {
          const netPct = grossPct - FEE_RT
          out.push({ symbol: sym, entryBar: pp.bar, netPct, win: netPct > 0, reason })
          pos[sym] = null; open--
        }
        continue
      }
      if (bar < entryFrom || bar >= entryTo || open >= p.maxPositions) continue
      const mom = ((h[bar] - h[bar - p.lookback]) / h[bar - p.lookback]) * 100
      if (mom > p.threshold) { pos[sym] = { entry: price, bar }; open++ }
    }
  }
  return out
}

function summarize(ts: T[]) {
  const n = ts.length
  if (!n) return { n: 0, winRate: 0, avgNet: 0, compounded: 0 }
  const wins = ts.filter(t => t.win).length
  const avgNet = ts.reduce((a, t) => a + t.netPct, 0) / n
  // Compounding approximation: equal-weight, ~1/maxPositions of equity per trade
  const perTradeWeight = 1 / 3
  const compounded = (ts.reduce((a, t) => a * (1 + (t.netPct / 100) * perTradeWeight), 1) - 1) * 100
  return { n, winRate: (wins / n) * 100, avgNet, compounded }
}

async function loadData(): Promise<Data> {
  const fi = process.argv.indexOf('--fetch')
  if (fi === -1 && fs.existsSync(FILE)) {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    console.log(`Loaded cached horizon-history.json (${Object.keys(j).map(k => `${k}:${j[k].length}`).join(' ')})`)
    return j
  }
  const days = Number(process.argv[fi + 1] || 365)
  const bars = days * 24
  const out: Data = {}
  for (const sym of SYMBOLS) {
    const closes: number[] = []
    let end = Date.now()
    while (closes.length < bars) {
      const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${PAIR[sym]}&interval=1h&limit=1000&endTime=${end}`)
      const rows: any[] = await r.json()
      if (!Array.isArray(rows) || rows.length === 0) break
      closes.unshift(...rows.map(k => Number(k[4])))
      end = rows[0][0] - 1
      if (rows.length < 1000) break
    }
    out[sym] = closes.slice(-bars)
    console.log(`Fetched ${sym}: ${out[sym].length} hourly bars`)
  }
  fs.writeFileSync(FILE, JSON.stringify(out))
  return out
}

async function main() {
  const data = await loadData()
  const maxLen = Math.max(...SYMBOLS.map(s => data[s]?.length ?? 0))
  const warmup = 96
  const isBars = 24 * 60   // 60-day in-sample
  const oosBars = 24 * 30  // 30-day out-of-sample
  console.log(`\n===== LONG-HORIZON WALK-FORWARD (1h bars, ${((maxLen) / 24).toFixed(0)} days, grid ${GRID.length} combos) =====`)

  const oosOpt: T[] = [], oosDef: T[] = []
  let fold = 0
  for (let isStart = warmup; isStart + isBars + oosBars <= maxLen; isStart += oosBars) {
    fold++
    const isTo = isStart + isBars, oosTo = isTo + oosBars
    let best: { p: P; e: number } | null = null
    for (const p of GRID) {
      const s = summarize(simulate(data, p, isStart, isTo))
      if (s.n >= 8 && (!best || s.avgNet > best.e)) best = { p, e: s.avgNet }
    }
    if (!best) { console.log(`Fold ${fold}: no qualifying params, skipped`); continue }
    const oos = simulate(data, best.p, isTo, oosTo)
    const def = simulate(data, DEFAULT, isTo, oosTo)
    oosOpt.push(...oos); oosDef.push(...def)
    const so = summarize(oos)
    console.log(`Fold ${fold}: pick look${best.p.lookback}h hold${best.p.hold}h thr${best.p.threshold}%  →  OOS n=${so.n} win=${so.winRate.toFixed(0)}% avgNet=${so.avgNet.toFixed(3)}%`)
  }

  const o = summarize(oosOpt), d = summarize(oosDef)
  console.log(`\n--- Aggregate OUT-OF-SAMPLE ---`)
  console.log(`Walk-forward optimized: n=${o.n} win=${o.winRate.toFixed(1)}% avgNet=${o.avgNet.toFixed(3)}%/trade compounded≈${o.compounded.toFixed(1)}%`)
  console.log(`Fixed default (72h/24h/2%): n=${d.n} win=${d.winRate.toFixed(1)}% avgNet=${d.avgNet.toFixed(3)}%/trade compounded≈${d.compounded.toFixed(1)}%`)
  console.log(`\nExit-reason mix (default): ${JSON.stringify(oosDef.reduce((m: any, t) => (m[t.reason] = (m[t.reason] ?? 0) + 1, m), {}))}`)
  console.log(`Per-symbol avgNet (default): ${SYMBOLS.map(s => { const b = oosDef.filter(t => t.symbol === s); return b.length ? `${s.split('/')[0]}:${(b.reduce((a, t) => a + t.netPct, 0) / b.length).toFixed(2)}` : `${s.split('/')[0]}:-` }).join(' ')}`)
  console.log(`\nSimulation of past data — not a prediction or guarantee.`)
}
main().catch(e => { console.error(e); process.exit(1) })
