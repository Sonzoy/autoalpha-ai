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

// Exit-geometry grid (SL/TP grids are obsolete: live exits are the selector's
// vol-scaled per-trade distances; these knobs re-shape that geometry instead).
const GRID_VOLCAP = [1, 1.25, 1.5, 2]        // cap on vol widening of exits (2 = live)
const GRID_ARM = [0.4, 0.6, 1]               // trail arms at this × stop distance
const GRID_TRAILDIST = [0.5, 0.75, 1]        // trail gap once armed, × stop distance
const GRID_CONF = [50, 60, 70]
const MIN_IS_TRADES = 6

function gridSearch(data: Data, isFrom: number, isTo: number): { params: Params; expectancy: number; n: number } | null {
  let best: { params: Params; expectancy: number; n: number } | null = null
  for (const volCapStop of GRID_VOLCAP) for (const trailArmFrac of GRID_ARM)
    for (const trailDistFrac of GRID_TRAILDIST) for (const minConfidence of GRID_CONF) {
      const params: Params = { ...BALANCED_PARAMS, volCapStop, trailArmFrac, trailDistFrac, minConfidence }
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
  console.log(`Grid: volCap${JSON.stringify(GRID_VOLCAP)} × arm${JSON.stringify(GRID_ARM)} × trailDist${JSON.stringify(GRID_TRAILDIST)} × minConf${JSON.stringify(GRID_CONF)} = ${GRID_VOLCAP.length * GRID_ARM.length * GRID_TRAILDIST.length * GRID_CONF.length} combos/fold`)

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
    console.log(`Fold ${fold}: IS[${isStart}-${isTo}] pick volCap ${best.params.volCapStop} arm ${best.params.trailArmFrac} trailDist ${best.params.trailDistFrac} minConf ${best.params.minConfidence}  →  OOS[${isTo}-${oosTo}] n=${so.n} win=${so.winRate.toFixed(0)}% avgNet=${so.avgNet.toFixed(3)}%`)
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
