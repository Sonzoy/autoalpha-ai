/**
 * Smoke test: parallel paper/live pipelines + mode-filtered views.
 *
 * Runs the REAL engine headless against a sanitized in-memory workspace
 * (no broker credentials, live authorization stripped — real orders are
 * impossible). Asserts:
 *   1. Paper pipeline trades autonomously; records tagged broker='paper'
 *   2. Live pipeline stays idle without a broker; zero live-tagged records
 *   3. Positions carry broker tags; perf points carry live flags
 *   4. View filters split records cleanly by mode
 *   5. Mode toggle does NOT touch baselines or ledgers (pure view switch)
 *   6. resetDemo wipes paper records but preserves live ones
 *
 *   npx tsx scripts/smoke-parallel.ts
 */

// ---- localStorage shim BEFORE any engine/store import (server/main.ts pattern)
const mem: Record<string, string> = {}
;(globalThis as any).localStorage = {
  getItem: (k: string) => mem[k] ?? null,
  setItem: (k: string, v: string) => { mem[k] = v },
  removeItem: (k: string) => { delete mem[k] },
  clear: () => { for (const k of Object.keys(mem)) delete mem[k] }
}

let failures = 0
function assert(cond: boolean, name: string, detail = '') {
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${name}${cond || !detail ? '' : ` — ${detail}`}`)
  if (!cond) failures++
}

async function main() {
  const { useStore, freshWorkspace, visibleTrades, visiblePositions, visiblePerf, modeOfBroker } = await import('../src/store/store')
  const { engineTick } = await import('../src/engine/TradingEngine')

  // Sanitized workspace: onboarded, auto-trading, demo assets allowed,
  // NO live chain, NO broker credentials.
  useStore.setState({
    ...freshWorkspace(),
    users: [{ name: 'Smoke', email: 'smoke@test.local', passwordHash: 'x' }],
    currentUser: 'smoke@test.local',
    profile: {
      name: 'Smoke', email: 'smoke@test.local', experience: 'Advanced',
      riskProfile: 'Balanced', markets: ['Crypto', 'Stocks', 'ETFs', 'Forex', 'Commodities'],
      broker: 'paper', riskAcknowledged: true, autoTradeConsent: true, onboarded: true
    },
    autoTrading: true, tradingMode: 'paper', liveDataOnly: false,
    liveUnlocked: false, adminApprovedLive: false, firstLiveOrderAuthorized: false
  } as any)

  console.log('\n-- running 400 engine ticks (paper should trade; live must stay idle) --')
  // The paper venue simulates a 500ms connect delay; production ticks are
  // ~3s apart. Give timers wall-clock room or the venue never connects.
  await engineTick()
  await new Promise(r => setTimeout(r, 800))
  for (let i = 0; i < 400; i++) {
    await engineTick()
    if (i % 25 === 0) await new Promise(r => setTimeout(r, 30))
  }

  const s = useStore.getState()
  const filled = s.trades.filter(t => t.status === 'Filled' || t.status === 'Closed')
  const liveTagged = s.trades.filter(t => t.broker !== 'paper')
  const untaggedPos = s.positions.filter(p => p.broker === undefined)

  assert(filled.length > 0, `paper pipeline traded autonomously (${filled.length} fills)`)
  assert(filled.every(t => t.broker === 'paper'), 'every fill tagged broker=paper')
  assert(liveTagged.length === 0, 'zero live-tagged trades without a broker')
  assert(untaggedPos.length === 0, 'every position carries a broker tag')
  assert(s.perf.length > 0 && s.perf.every(p => p.live === false), `all ${s.perf.length} perf points tagged live=false (no real account synced)`)
  assert(s.engineByMode.live.note.includes('idle'), 'live pipeline reports idle', s.engineByMode.live.note)
  assert(s.cash !== 100_000 || filled.length === 0, 'paper ledger cash moved with fills', `cash=${s.cash.toFixed(2)}`)
  const shorts = s.trades.filter(t => t.direction === 'Short')
  console.log(`  INFO  short trades proposed/filled on paper: ${shorts.length} (spot-only block applies to live only)`)

  console.log('\n-- view filter checks --')
  const paperView = { trades: s.trades, positions: s.positions, perf: s.perf, tradingMode: 'paper' as const }
  const liveView = { trades: s.trades, positions: s.positions, perf: s.perf, tradingMode: 'live' as const }
  assert(visibleTrades(paperView).length === s.trades.length, 'paper view shows all paper trades')
  assert(visibleTrades(liveView).length === 0, 'live view shows zero trades (none exist)')
  assert(visiblePositions(paperView).length === s.positions.length, 'paper view shows all positions')
  assert(visiblePerf(liveView).length === 0, 'live view shows zero perf points')

  console.log('\n-- mode toggle is a pure view switch --')
  const before = { cash: s.cash, paperDayStart: s.paperDayStart, paperPeak: s.paperPeak, dayStartEquity: s.dayStartEquity, peakEquity: s.peakEquity, nTrades: s.trades.length, nPos: s.positions.length }
  useStore.getState().setTradingMode('live')
  useStore.getState().setTradingMode('paper')
  const after = useStore.getState()
  assert(after.cash === before.cash && after.paperDayStart === before.paperDayStart &&
    after.paperPeak === before.paperPeak && after.dayStartEquity === before.dayStartEquity &&
    after.peakEquity === before.peakEquity, 'toggling modes changed no ledgers or baselines')
  assert(after.trades.length === before.nTrades && after.positions.length === before.nPos, 'toggling modes changed no records')

  console.log('\n-- resetDemo preserves live records --')
  const fakeLive: any = {
    id: 'tr-fake-live', symbol: 'BTC/USD', market: 'Crypto', broker: 'binance', direction: 'Long',
    entryPrice: 60000, qty: 0.001, stopLoss: 59000, takeProfit: 62000, pnl: 0, strategy: 'Trend Momentum',
    confidence: 70, status: 'Filled', rationale: 'test', riskChecks: [], regime: 'Trending', openedAt: Date.now()
  }
  useStore.getState().addTrade(fakeLive)
  useStore.getState().addPosition({ tradeId: 'tr-fake-live', symbol: 'BTC/USD', market: 'Crypto', direction: 'Long', qty: 0.001, entryPrice: 60000, stopLoss: 59000, takeProfit: 62000, strategy: 'Trend Momentum', confidence: 70, openedAt: Date.now(), broker: 'binance' })
  useStore.getState().resetDemo()
  const r = useStore.getState()
  assert(r.trades.some(t => t.id === 'tr-fake-live'), 'live trade survived resetDemo')
  assert(r.positions.some(p => p.tradeId === 'tr-fake-live'), 'live position survived resetDemo')
  assert(r.trades.every(t => t.broker !== 'paper'), 'all paper trades wiped by resetDemo')
  assert(r.cash === 100_000, 'paper cash reset to 100k')

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
}
main().catch(e => { console.error(e); process.exit(1) })
