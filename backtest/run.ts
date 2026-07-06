/**
 * Single backtest run of the real strategy code, Balanced preset, long-only.
 *
 *   npm run backtest                 # uses backtest/real-history.json
 *   npm run backtest -- --fetch 30   # fetch 30 days of Binance 5m klines first
 *
 * Backtest = simulation of past data. Not a prediction or guarantee.
 */
import { loadData, simulate, summarize, calibration, pearson, BALANCED_PARAMS, SYMBOLS } from './engine'

async function main() {
  const data = await loadData()
  const series = SYMBOLS.filter(s => data[s]?.history?.length >= 45)
  const hours = (Math.max(...series.map(s => data[s].history.length)) * 5) / 60
  const trades = simulate(data, BALANCED_PARAMS)
  const s = summarize(trades)

  console.log(`\n===== BACKTEST (Balanced preset, long-only) =====`)
  console.log(`Data: ${series.join(', ')} · ~${hours.toFixed(1)}h of real 5-min bars/symbol · SL ${BALANCED_PARAMS.stopLossPct}% TP ${BALANCED_PARAMS.takeProfitPct}% · 0.2% RT commission`)
  if (!s.n) { console.log('No trades (no long signal cleared the 50-conviction threshold).'); return }
  console.log(`Trades ${s.n}   Wins ${s.wins}   Win rate ${s.winRate.toFixed(1)}%`)
  console.log(`Avg P&L/trade: gross ${s.avgGross.toFixed(3)}%  net ${s.avgNet.toFixed(3)}%   Compounded net ${s.compounded.toFixed(2)}%`)

  console.log(`\n--- Confidence calibration (does higher confidence => higher realized win rate?) ---`)
  for (const b of calibration(trades)) {
    if (!b.n) { console.log(`  conf ${b.lo}-${b.hi}:  (no trades)`); continue }
    console.log(`  conf ${b.lo}-${b.hi}:  n=${String(b.n).padStart(3)}  win=${b.winRate!.toFixed(0).padStart(3)}%  avgNet=${b.avgNet!.toFixed(3)}%`)
  }
  const conf = trades.map(t => t.confidence)
  console.log(`  corr(confidence, win)    = ${pearson(conf, trades.map(t => t.win ? 1 : 0)).toFixed(3)}`)
  console.log(`  corr(confidence, net P&L)= ${pearson(conf, trades.map(t => t.netPct)).toFixed(3)}`)
  console.log(`  confidence observed: ${Math.min(...conf)}–${Math.max(...conf)}`)
  console.log(`\n(Small sample => wide error bars. Run with --fetch 30 on an unrestricted machine for a real read.)`)
}
main().catch(e => { console.error(e); process.exit(1) })
