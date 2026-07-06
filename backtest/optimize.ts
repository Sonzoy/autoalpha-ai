/**
 * Walk-forward parameter optimizer.
 *
 * Grid-searches stop-loss / take-profit / confidence-threshold on IN-SAMPLE
 * windows, then measures the chosen parameters on the following OUT-OF-SAMPLE
 * window — rolling forward. Only the aggregate OOS result is trustworthy; IS
 * results overfit by construction. Compares the optimizer against the default
 * Balanced preset on the same OOS windows.
 *
 *   npm run optimize                 # local data (usually too short — will warn)
 *   npm run optimize -- --fetch 45   # 45 days of Binance 5m klines (recommended)
 *
 * Optimization over past data does NOT guarantee future performance.
 */
import { loadData, simulate, summarize, WARMUP, SYMBOLS, BALANCED_PARAMS, type Params, type Trade, type Data } from './engine'

const GRID_SL = [1, 1.5, 2, 3]
const GRID_TP = [2, 3, 4, 6]
const GRID_CONF = [50, 55, 60, 65, 70]
const MIN_IS_TRADES = 6

function gridSearch(data: Data, isFrom: number, isTo: number): { params: Params; expectancy: number; n: number } | null {
  let best: { params: Params; expectancy: number; n: number } | null = null
  for (const stopLossPct of GRID_SL) for (const takeProfitPct of GRID_TP) for (const minConfidence of GRID_CONF) {
    const params: Params = { ...BALANCED_PARAMS, stopLossPct, takeProfitPct, minConfidence }
    const s = summarize(simulate(data, params, isFrom, isTo))
    if (s.n < MIN_IS_TRADES) continue
    if (!best || s.expectancy > best.expectancy) best = { params, expectancy: s.expectancy, n: s.n }
  }
  return best
}

async function main() {
  const data = await loadData()
  const series = SYMBOLS.filter(s => data[s]?.history?.length >= 45)
  const maxLen = Math.max(...series.map(s => data[s].history.length))
  const total = maxLen - WARMUP
  console.log(`\n===== WALK-FORWARD OPTIMIZER =====`)
  console.log(`Grid: SL${JSON.stringify(GRID_SL)} × TP${JSON.stringify(GRID_TP)} × minConf${JSON.stringify(GRID_CONF)} = ${GRID_SL.length * GRID_TP.length * GRID_CONF.length} combos/fold`)

  // Window sizing scales with available data; needs a decent history to be real.
  const isBars = Math.floor(total * 0.5 > 1500 ? 1500 : total * 0.45)
  const oosBars = Math.floor(isBars * 0.5)
  if (total < 250 || isBars < 80 || oosBars < 40) {
    console.log(`\n⚠  Only ${total} usable bars — far too short for walk-forward.`)
    console.log(`   Run:  npm run optimize -- --fetch 45   (pulls 45 days of Binance 5-min klines)`)
    console.log(`\n   For reference, a single IN-SAMPLE grid search on all local data (OVERFIT — do not trust):`)
    const bestIS = gridSearch(data, WARMUP, maxLen)
    if (bestIS) console.log(`   best IS params: SL ${bestIS.params.stopLossPct}% TP ${bestIS.params.takeProfitPct}% minConf ${bestIS.params.minConfidence} · expectancy ${bestIS.expectancy.toFixed(3)}%/trade (n=${bestIS.n})`)
    else console.log(`   (no parameter set produced >= ${MIN_IS_TRADES} trades on this little data)`)
    return
  }

  const oosOpt: Trade[] = []
  const oosDefault: Trade[] = []
  let fold = 0
  for (let isStart = WARMUP; isStart + isBars + oosBars <= maxLen; isStart += oosBars) {
    fold++
    const isTo = isStart + isBars
    const oosTo = isTo + oosBars
    const best = gridSearch(data, isStart, isTo)
    if (!best) { console.log(`Fold ${fold}: no qualifying params in-sample, skipped`); continue }
    const oos = simulate(data, best.params, isTo, oosTo)
    const def = simulate(data, BALANCED_PARAMS, isTo, oosTo)
    oosOpt.push(...oos); oosDefault.push(...def)
    const so = summarize(oos)
    console.log(`Fold ${fold}: IS[${isStart}-${isTo}] pick SL ${best.params.stopLossPct}% TP ${best.params.takeProfitPct}% minConf ${best.params.minConfidence}  →  OOS[${isTo}-${oosTo}] n=${so.n} win=${so.winRate.toFixed(0)}% avgNet=${so.avgNet.toFixed(3)}%`)
  }

  const o = summarize(oosOpt), d = summarize(oosDefault)
  console.log(`\n--- Aggregate OUT-OF-SAMPLE (the only honest numbers) ---`)
  console.log(`Optimized : n=${o.n}  win=${o.winRate.toFixed(1)}%  avgNet=${o.avgNet.toFixed(3)}%/trade  compounded=${o.compounded.toFixed(2)}%`)
  console.log(`Default    : n=${d.n}  win=${d.winRate.toFixed(1)}%  avgNet=${d.avgNet.toFixed(3)}%/trade  compounded=${d.compounded.toFixed(2)}%`)
  const verdict = o.avgNet > d.avgNet && o.avgNet > 0
    ? 'Optimization beat the default out-of-sample AND was net-positive.'
    : o.avgNet <= 0
      ? 'Even the optimized parameters are net-negative out-of-sample after costs — the edge does not survive.'
      : 'Optimization did not beat the default out-of-sample — likely in-sample overfitting.'
  console.log(`Verdict: ${verdict}`)
  console.log(`\n(Walk-forward reduces but never eliminates overfitting. Past performance != future results.)`)
}
main().catch(e => { console.error(e); process.exit(1) })
