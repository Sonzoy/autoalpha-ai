/**
 * Variant experiment runner — compares exit-geometry / gating variants on the
 * SAME cached data (backtest/real-history.json), full-sample plus a 3-fold
 * out-of-sample sanity split (fit nothing in-sample here; folds only reveal
 * whether a variant's edge is stable across time).
 *
 *   npm run backtest -- --fetch 30   # refresh data first
 *   npx tsx backtest/experiment.ts
 *
 * Simulations of past data — not predictions, not guarantees.
 */
import { loadData, simulate, summarize, BALANCED_PARAMS, WARMUP, SYMBOLS, type Params } from './engine'

interface Variant { name: string; p: Params }

const variants: Variant[] = [
  { name: 'LIVE today (volCap2, arm1.0, dist1.0, conf50)', p: { ...BALANCED_PARAMS } },
  { name: 'No vol widening (volCap1)', p: { ...BALANCED_PARAMS, volCapStop: 1 } },
  { name: 'Tight trail (arm0.4, dist0.5)', p: { ...BALANCED_PARAMS, trailArmFrac: 0.4, trailDistFrac: 0.5 } },
  { name: 'volCap1 + tight trail', p: { ...BALANCED_PARAMS, volCapStop: 1, trailArmFrac: 0.4, trailDistFrac: 0.5 } },
  { name: 'volCap1.25 + arm0.6 dist0.5', p: { ...BALANCED_PARAMS, volCapStop: 1.25, trailArmFrac: 0.6, trailDistFrac: 0.5 } },
  { name: 'Fewer trades (cooldown 24 = 2h)', p: { ...BALANCED_PARAMS, entryCooldown: 24 } },
  { name: 'Fewer + volCap1 + tight trail', p: { ...BALANCED_PARAMS, entryCooldown: 24, volCapStop: 1, trailArmFrac: 0.4, trailDistFrac: 0.5 } },
  { name: 'Much fewer (cooldown 72 = 6h) + tight', p: { ...BALANCED_PARAMS, entryCooldown: 72, volCapStop: 1, trailArmFrac: 0.4, trailDistFrac: 0.5 } },
  { name: 'Longer hold (96 bars = 8h)', p: { ...BALANCED_PARAMS, maxHoldBars: 96 } },
  { name: 'Longer hold + volCap1 + tight trail', p: { ...BALANCED_PARAMS, maxHoldBars: 96, volCapStop: 1, trailArmFrac: 0.4, trailDistFrac: 0.5 } },
  { name: 'High conviction only (conf70)', p: { ...BALANCED_PARAMS, minConfidence: 70 } },
  { name: 'LOW conviction only would be data-mining — skipped', p: { ...BALANCED_PARAMS, minConfidence: 50 } },
]

async function main() {
  const data = await loadData()
  const maxLen = Math.max(...SYMBOLS.filter(s => data[s]?.history?.length >= 45).map(s => data[s].history.length))
  const third = Math.floor((maxLen - WARMUP) / 3)
  const folds: [number, number][] = [0, 1, 2].map(i => [WARMUP + i * third, WARMUP + (i + 1) * third])

  console.log(`\n${'Variant'.padEnd(42)} ${'n'.padStart(5)} ${'win%'.padStart(6)} ${'avgNet%'.padStart(8)} ${'comp%'.padStart(8)}   fold avgNet% (early/mid/late)`)
  for (const v of variants) {
    if (v.name.includes('skipped')) continue
    const s = summarize(simulate(data, v.p))
    const f = folds.map(([a, b]) => summarize(simulate(data, v.p, a, b)).avgNet.toFixed(3))
    console.log(`${v.name.padEnd(42)} ${String(s.n).padStart(5)} ${s.winRate.toFixed(1).padStart(6)} ${s.avgNet.toFixed(3).padStart(8)} ${s.compounded.toFixed(1).padStart(8)}   ${f.join(' / ')}`)
  }
  console.log(`\nReminder: all figures are simulations of past data, not predictions.`)
}
main().catch(e => { console.error(e); process.exit(1) })
