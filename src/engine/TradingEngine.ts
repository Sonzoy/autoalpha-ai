import { MarketSimulator } from './MarketSimulator'
import { StrategySelector } from './strategies/StrategySelector'
import { MARKET_EXPOSURE_CAP_PCT, RiskManager, type RiskContext } from './RiskManager'
import { AuditLogger } from './AuditLogger'
import { PaperBrokerAdapter } from './brokers/PaperBrokerAdapter'
import { IBKRBrokerAdapter } from './brokers/IBKRBrokerAdapter'
import { EToroBrokerAdapter } from './brokers/EToroBrokerAdapter'
import { BinanceBrokerAdapter } from './brokers/BinanceBrokerAdapter'
import type { BrokerAdapter } from './brokers/BrokerAdapter'
import type { AssetState, BrokerId, IntelSnapshot, Position, PriceSource, Trade } from '../types'
import { MarketDataService } from './MarketDataService'
import { freshWsQuotes, startStream } from './LiveStream'
import { positionPnl, positionValue, useStore } from '../store/store'

/**
 * TradingEngine — the orchestrator. Each tick:
 *  market data → sentiment → position management (stops/targets/trailing)
 *  → portfolio guards → StrategySelector → RiskManager → order preview
 *  → broker execution → fill tracking → portfolio update → audit log.
 */

export const brokers: Record<BrokerId, BrokerAdapter> = {
  paper: new PaperBrokerAdapter(),
  ibkr: new IBKRBrokerAdapter(),
  etoro: new EToroBrokerAdapter(),
  binance: new BinanceBrokerAdapter()
}

/** The healthy real-broker adapter live orders route to. */
export function liveAdapter(): BrokerAdapter | null {
  const preferred = useStore.getState().profile.broker
  if (preferred === 'binance') return brokers.binance.healthy() ? brokers.binance : null
  if (preferred === 'ibkr') return brokers.ibkr.healthy() ? brokers.ibkr : null
  if (brokers.binance.healthy()) return brokers.binance
  if (brokers.ibkr.healthy()) return brokers.ibkr
  return null
}

/** Real-account equity, or null when no synced broker portfolio exists. */
function liveEquity(): number | null {
  const s = useStore.getState()
  return s.brokerPortfolio && s.brokerPortfolio.totalUsd > 0 ? s.brokerPortfolio.totalUsd : null
}

/** Paper-ledger equity: cash + paper-tagged positions only. */
function paperEq(assets: AssetState[]): number {
  const s = useStore.getState()
  const priceOf = (sym: string) => assets.find(a => a.symbol === sym)?.price ?? 0
  return s.cash + s.positions
    .filter(p => (p.broker ?? 'paper') === 'paper')
    .reduce((acc, p) => acc + positionValue(p, priceOf(p.symbol)), 0)
}

let sim: MarketSimulator | null = null
let ticksSinceTrade = 99
let busy = false
let lastUser: string | null = null
let lastLiveFetch = 0
let lastPortfolioSync = 0
let connectingPaper = false

const STABLES = new Set(['USDT', 'USDC', 'FDUSD', 'BUSD', 'DAI', 'TUSD'])

let lastBinanceAttempt = 0

/**
 * Self-heal the Binance connection after restarts: if credentials are
 * configured but the adapter is disconnected, reconnect automatically
 * (once a minute) — live trading must not silently stop because the
 * process restarted.
 */
function ensureBinanceConnected(): void {
  const s = useStore.getState()
  const bn = brokers.binance as any
  if (!s.brokerConfig?.binance || bn.status() !== 'disconnected') return
  if (Date.now() - lastBinanceAttempt < 60_000) return
  lastBinanceAttempt = Date.now()
  bn.configure(s.brokerConfig.binance)
  void bn.connect().then((r: any) => {
    useStore.getState().setBrokerConn('binance', {
      status: bn.status(), message: r.message, permissions: r.permissions,
      healthy: bn.healthy(), lastSync: r.ok ? Date.now() : null
    })
    if (r.ok) AuditLogger.info('BROKER', 'Binance auto-reconnected after restart')
  }).catch(() => { /* retried next minute */ })
}

/**
 * Refresh the REAL account snapshot from the connected broker (Binance)
 * every 60s — the dashboard shows this as the authoritative portfolio in
 * live mode, and live order sizing is based on it.
 */
function syncBrokerPortfolio(): void {
  if (Date.now() - lastPortfolioSync < 60_000) return
  lastPortfolioSync = Date.now()
  const bn = brokers.binance as any
  if (!bn.healthy?.()) return
  void bn.sync().then(() => {
    const priceOf = (sym: string) => useStore.getState().assets.find(a => a.symbol === sym)?.price ?? 0
    const rows = (bn.getCachedBalances() as { asset: string; qty: number }[])
      .map(b => {
        const usd = STABLES.has(b.asset) ? b.qty : (priceOf(`${b.asset}/USD`) > 0 ? b.qty * priceOf(`${b.asset}/USD`) : null)
        return { asset: b.asset, qty: b.qty, usd }
      })
      .sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0))
      .slice(0, 10)
    const totalUsd = rows.reduce((a, r) => a + (r.usd ?? 0), 0)
    useStore.getState().setBrokerPortfolio({ broker: 'binance', totalUsd, syncedAt: Date.now(), balances: rows })
  }).catch(() => { /* next cycle retries */ })
}

/**
 * Self-heal the paper venue connection. Persisted state can claim
 * "connected" from a previous session while the in-memory adapter starts
 * disconnected after a reload — the adapter is the source of truth.
 */
function ensurePaperConnected(): void {
  if (connectingPaper || brokers.paper.status() !== 'disconnected') return
  connectingPaper = true
  void brokers.paper.connect().then(r => {
    useStore.getState().setBrokerConn('paper', {
      status: 'connected', message: r.message, permissions: r.permissions,
      healthy: true, lastSync: Date.now()
    })
  }).catch(() => { /* retried next tick */ }).finally(() => { connectingPaper = false })
}

export function getSimulator(): MarketSimulator {
  // Per-user isolation: switching accounts discards the previous user's
  // in-memory market state and reseeds from the new user's workspace.
  const cur = useStore.getState().currentUser
  if (cur !== lastUser) { sim = null; lastUser = cur; ticksSinceTrade = 99 }
  if (!sim) {
    const saved = useStore.getState().assets
    sim = new MarketSimulator(saved.length ? saved : undefined)
  }
  return sim
}

export async function engineTick(): Promise<void> {
  if (busy) return
  busy = true
  try { await tick() } finally { busy = false }
}

async function tick(): Promise<void> {
  const st = useStore.getState()
  if (!st.currentUser || !st.profile.onboarded) return
  ensurePaperConnected()
  ensureBinanceConnected()
  syncBrokerPortfolio()

  // 1–2. Market data + sentiment update
  const simulator = getSimulator()
  // Real-time layer: Binance WebSocket stream (sub-second crypto ticks).
  // Applied every tick; REST polling below remains the fallback layer.
  startStream()
  const wsFresh = freshWsQuotes()
  if (Object.keys(wsFresh).length) {
    simulator.applyLiveQuotes(wsFresh)
    const cur = useStore.getState().assetSources
    let changed = false
    const next = { ...cur }
    for (const sym of Object.keys(wsFresh)) if (next[sym] !== 'binance') { next[sym] = 'binance'; changed = true }
    if (changed) useStore.getState().setAssetSources(next)
  }
  // Live feeds: refresh every 30s in the background (crypto: CoinGecko,
  // FX: Frankfurter/ECB, stocks/ETFs: Finnhub with user key). Failures
  // fall back silently to the simulator.
  if (Date.now() - lastLiveFetch > 30_000) {
    lastLiveFetch = Date.now()
    const key = st.marketKeys?.finnhub ?? ''
    const feeds = st.customFeeds ?? []
    void MarketDataService.seedCryptoHistory().then(h => {
      if (sim && Object.keys(h).length) sim.applyLiveHistory(h)
    }).catch(() => {})
    void MarketDataService.seedStockHistory(key).then(h => {
      if (sim && Object.keys(h).length) sim.applyLiveHistory(h)
    }).catch(() => {})
    void MarketDataService.fetchQuotes(key, feeds).then(quotes => {
      const s2 = useStore.getState()
      if (!s2.currentUser || !sim) return
      sim.applyLiveQuotes(quotes)
      const wsNow = freshWsQuotes()
      const sources: Record<string, PriceSource> = {}
      for (const a of sim.assets) {
        sources[a.symbol] = wsNow[a.symbol] ? 'binance'
          : quotes[a.symbol]?.source ?? (sim.liveSymbols.has(a.symbol) ? 'coingecko' : 'simulated')
      }
      s2.setAssetSources(sources)
    }).catch(() => { /* degraded to simulation */ })
  }
  simulator.step()
  const assets = simulator.assets.map(a => ({ ...a, history: [...a.history] }))
  const intel = { ...simulator.intel }
  useStore.getState().setMarket(assets, intel, simulator.globalRegime())

  // Day roll — both pipelines get fresh daily baselines
  if (new Date().toDateString() !== st.dayStamp) {
    simulator.rollDay()
    useStore.getState().rollDay(liveEquity() ?? paperEq(assets))
    useStore.getState().rollPaperDay(paperEq(assets))
    AuditLogger.info('SYSTEM', 'New trading day — daily P&L counters reset (paper + live)')
  }

  // 3. Manage open positions (stops / targets / trailing / time exit)
  const priceOf = (sym: string) => assets.find(a => a.symbol === sym)?.price ?? 0
  for (const p of [...useStore.getState().positions]) {
    const price = priceOf(p.symbol)
    if (!price) continue
    const s = useStore.getState()

    // NEVER manage a REAL broker position on simulated prices — e.g. right
    // after a restart, before live feeds arrive, the simulator's phantom
    // ticks must not trigger real market SELLs at the broker. (This exact
    // gap closed 5 live positions near breakeven after restarts.)
    const posTrade = s.trades.find(t => t.id === p.tradeId)
    const isRealPosition = !!posTrade && posTrade.broker !== 'paper'
    if (isRealPosition && (s.assetSources[p.symbol] ?? 'simulated') === 'simulated') continue

    // Trailing stop ratchet. Rules (backtest-validated on 30d real 5-min
    // data — arm 0.4× / trail 0.5× beat the 1×/1× geometry on every fold,
    // win rate 38.5% → 43.3%):
    //  1. Trail by 0.5× the position's OWN stop distance (volatility-scaled
    //     at entry, derived from entry vs stopLoss) — not the global setting.
    //  2. Arm once price has moved 0.4× the stop distance in favor — early
    //     enough to catch the small moves that 4h holds actually produce.
    //  3. Once armed, the trail never sits below breakeven + round-trip fees
    //     (~0.3%): an armed trailing exit is a small WIN by construction.
    if (s.settings.trailingStopEnabled) {
      const TRAIL_ARM_FRAC = 0.4, TRAIL_DIST_FRAC = 0.5
      const stopDist = p.entryPrice > 0 ? Math.abs(p.entryPrice - p.stopLoss) / p.entryPrice : 0
      const beFloor = p.direction === 'Long' ? p.entryPrice * 1.003 : p.entryPrice * 0.997
      const armed = stopDist > 0 && (p.direction === 'Long'
        ? price >= p.entryPrice * (1 + stopDist * TRAIL_ARM_FRAC)
        : price <= p.entryPrice * (1 - stopDist * TRAIL_ARM_FRAC))
      if (armed) {
        const raw = p.direction === 'Long'
          ? price * (1 - stopDist * TRAIL_DIST_FRAC)
          : price * (1 + stopDist * TRAIL_DIST_FRAC)
        const trail = p.direction === 'Long' ? Math.max(raw, beFloor) : Math.min(raw, beFloor)
        const better = p.trailingStop === undefined ||
          (p.direction === 'Long' ? trail > p.trailingStop : trail < p.trailingStop)
        if (better) useStore.getState().patchPosition(p.tradeId, { trailingStop: trail })
      } else if (p.trailingStop !== undefined &&
        (p.direction === 'Long' ? p.trailingStop < beFloor : p.trailingStop > beFloor)) {
        // Stale trail from the old ungated logic (set at entry or on phantom
        // restart prices): a legit trail can never sit in the loss zone under
        // rules 2–3, so a below-breakeven trail is by definition stale. Drop
        // it — the hard stop loss still protects the position.
        useStore.getState().patchPosition(p.tradeId, { trailingStop: undefined })
      }
    }

    const pos = useStore.getState().positions.find(x => x.tradeId === p.tradeId)!
    const effStop = pos.trailingStop !== undefined && s.settings.trailingStopEnabled ? pos.trailingStop : pos.stopLoss
    let closeReason: string | null = null

    if (s.settings.stopLossEnabled) {
      if (pos.direction === 'Long' && price <= effStop) closeReason = pos.trailingStop !== undefined && effStop === pos.trailingStop ? 'Trailing stop hit' : 'Stop loss hit'
      if (pos.direction === 'Short' && price >= effStop) closeReason = pos.trailingStop !== undefined && effStop === pos.trailingStop ? 'Trailing stop hit' : 'Stop loss hit'
    }
    if (!closeReason && s.settings.takeProfitEnabled) {
      if (pos.direction === 'Long' && price >= pos.takeProfit) closeReason = 'Take profit hit'
      if (pos.direction === 'Short' && price <= pos.takeProfit) closeReason = 'Take profit hit'
    }
    // time-based exit: live-priced assets hold up to 4h (real markets need
    // time to reach targets); simulated assets keep the short demo horizon
    const isLivePos = (useStore.getState().assetSources[pos.symbol] ?? 'simulated') !== 'simulated'
    if (!closeReason && Date.now() - pos.openedAt > (isLivePos ? 4 * 3600_000 : 200 * 2500)) closeReason = 'Max holding period reached'
    // emergency stop / kill switch flatten
    if (!closeReason && (s.emergencyStop || s.killSwitch)) closeReason = s.killSwitch ? 'Kill switch: flattening positions' : 'Emergency stop: flattening positions'

    if (closeReason) await closePosition(pos, price, closeReason)
  }

  // 4. Equity, peaks, perf, portfolio guards — PER PIPELINE.
  // Paper and live run in parallel with separate ledgers and baselines. The
  // guards (daily loss / drawdown → auto-pause) protect only REAL money:
  // autoPaused blocks the LIVE pipeline; paper is a test sandbox and keeps
  // running so strategies can be evaluated through drawdowns.
  {
    const pEq = paperEq(assets)
    const lEq = liveEquity()

    // Paper baselines: track independently (rebase if migration left stale values)
    const s = useStore.getState()
    if (pEq > 0 && (s.paperDayStart > pEq * 3 || s.paperDayStart < pEq / 3)) useStore.getState().rollPaperDay(pEq)
    if (pEq > useStore.getState().paperPeak * 3 || pEq < useStore.getState().paperPeak / 3) useStore.getState().setPaperPeak(pEq)
    if (pEq > useStore.getState().paperPeak) useStore.getState().setPaperPeak(pEq)
    const sp = useStore.getState()
    useStore.getState().pushPerf({
      ts: Date.now(), equity: pEq,
      drawdown: round2(sp.paperPeak > 0 ? ((pEq - sp.paperPeak) / sp.paperPeak) * 100 : 0),
      dailyPnl: round2(pEq - sp.paperDayStart), live: false
    })

    // Live baselines + guards: only when a real account is synced
    if (lEq !== null) {
      const s1 = useStore.getState()
      // Baseline sanity: stored baselines can be orders of magnitude off after
      // a basis change (e.g. paper $100k dayStart vs real $208). A >3x
      // divergence cannot be a real intraday move; rebase instead of "breaching".
      if (s1.dayStartEquity > lEq * 3 || s1.dayStartEquity < lEq / 3 ||
        s1.peakEquity > lEq * 3 || s1.peakEquity < lEq / 3) {
        useStore.getState().rollDay(lEq)
        useStore.getState().setPeak(lEq)
        AuditLogger.info('RISK', 'Live risk baselines rebased — equity basis changed',
          `Stored baselines (day ${s1.dayStartEquity.toFixed(2)}, peak ${s1.peakEquity.toFixed(2)}) diverged >3x from real account equity ${lEq.toFixed(2)}.`)
      }
      if (lEq > useStore.getState().peakEquity) useStore.getState().setPeak(lEq)
      const s2 = useStore.getState()
      useStore.getState().pushPerf({
        ts: Date.now(), equity: lEq,
        drawdown: round2(s2.peakEquity > 0 ? ((lEq - s2.peakEquity) / s2.peakEquity) * 100 : 0),
        dailyPnl: round2(lEq - s2.dayStartEquity), live: true
      })

      // Self-heal a stale risk pause; a real breach stays in force.
      if (s2.autoPaused && RiskManager.portfolioGuards(riskCtx('live', lEq)) === null) {
        useStore.getState().resumeTrading()
        AuditLogger.info('RISK', 'Stale live risk pause auto-cleared',
          `The recorded breach ("${s2.pauseReason}") no longer holds against current baselines (equity ${lEq.toFixed(2)}).`)
      }
      const s3 = useStore.getState()
      if (s3.autoTrading && !s3.autoPaused) {
        const guard = RiskManager.portfolioGuards(riskCtx('live', lEq))
        // Pause the LIVE pipeline only — paper keeps testing strategies.
        if (guard) useStore.getState().pauseTrading(guard)
      }
    }
  }

  // 5–10. Propose → risk check → preview → execute → fill → audit.
  // BOTH pipelines run every cycle: paper (test sandbox, shorts allowed) and
  // live (real broker, long-only on spot). Each has its own ledger, pacing,
  // and engine status; the UI's mode toggle only selects which one to VIEW.
  ticksSinceTrade++
  const s = useStore.getState()
  if (!s.autoTrading || s.emergencyStop || s.killSwitch) return
  if (ticksSinceTrade < 5 || Math.random() > 0.45) return

  await proposeFor('paper', assets, intel)
  await proposeFor('live', assets, intel)
}

const MODE_TAG: Record<'paper' | 'live', string> = { paper: '[PAPER]', live: '[LIVE]' }

/** One pipeline's proposal pass. Everything is scoped to `pipeline`:
 *  equity basis, positions, pacing, venue rules, and engine status. */
async function proposeFor(pipeline: 'paper' | 'live', assets: AssetState[], intel: Record<string, IntelSnapshot>): Promise<void> {
  const s = useStore.getState()
  const status = (mode: Parameters<typeof s.setEngineStatusFor>[1], note: string, conf: number) =>
    useStore.getState().setEngineStatusFor(pipeline, mode, note, conf)
  const tag = MODE_TAG[pipeline]
  const priceOf = (sym: string) => assets.find(a => a.symbol === sym)?.price ?? 0

  // Pipeline prerequisites
  const realBroker = liveAdapter()
  if (pipeline === 'live') {
    if (s.autoPaused) return // risk pause protects real money; paper unaffected
    const liveReady = s.liveUnlocked && s.adminApprovedLive && !!realBroker && s.firstLiveOrderAuthorized
    if (!liveReady) {
      status('Cash / Risk-Off', !realBroker
        ? 'Live pipeline idle: no healthy real broker connected.'
        : 'Live pipeline idle: unlock chain incomplete (compliance approval + first-order authorization required).', 0)
      return
    }
    if (liveEquity() === null) {
      status('Cash / Risk-Off', 'Live pipeline idle: waiting for the first real account sync from the broker.', 0)
      return
    }
  } else if (!brokers.paper.healthy()) {
    status('Cash / Risk-Off', 'Paper venue connecting…', 0)
    return
  }

  const equity = pipeline === 'live' ? liveEquity()! : paperEq(assets)
  const myPositions = s.positions.filter(p => (p.broker ?? 'paper') === 'paper' ? pipeline === 'paper' : pipeline === 'live')

  // Entry pacing (per pipeline): at the old ~15s minimum spacing the engine
  // averaged ~21 trades/day — ~4%/day of commission drag. Backtest (30d,
  // 8 pairs): 2h spacing more than halved the compounded loss; all folds agreed.
  {
    const ENTRY_SPACING_MS = 2 * 3600_000
    const lastEntry = s.trades.reduce((m, t) => {
      const tm = t.broker === 'paper' ? 'paper' : 'live'
      return tm === pipeline && (t.status === 'Filled' || t.status === 'Closed') && t.openedAt > m ? t.openedAt : m
    }, 0)
    const wait = ENTRY_SPACING_MS - (Date.now() - lastEntry)
    if (wait > 0) {
      status(useStore.getState().engineByMode[pipeline].mode,
        `Entry pacing: next entry window opens in ${Math.ceil(wait / 60000)} min (2h spacing keeps commission drag survivable).`,
        useStore.getState().engineByMode[pipeline].confidence)
      return
    }
  }

  // Live-data-only policy: never open trades on simulated prices unless the
  // user has explicitly allowed demo assets.
  let tradable = s.liveDataOnly
    ? assets.filter(a => (s.assetSources[a.symbol] ?? 'simulated') !== 'simulated')
    : assets
  // Venue restriction (live only): only pairs the real broker can route.
  const liveVenue = pipeline === 'live' ? realBroker : null
  if (liveVenue?.supportsSymbol) tradable = tradable.filter(a => liveVenue.supportsSymbol!(a.symbol))
  if (s.liveDataOnly && tradable.filter(a => s.profile.markets.includes(a.market)).length === 0) {
    status('Cash / Risk-Off',
      liveVenue?.supportsSymbol
        ? `No tradable pairs: your ${liveVenue.name} account supports only its listed spot pairs (crypto), and none of those are in your selected markets.`
        : 'Live-data-only policy: no live-priced assets in your selected markets yet. Crypto & FX feeds are automatic; add a Finnhub key or custom feeds for stocks/ETFs (Market Intel page).', 0)
    return
  }

  // Shorts: paper venue supports them (fully collateralized); live spot cannot.
  const longOnly = pipeline === 'live' && realBroker?.canShort === false
  const selection = StrategySelector.select(tradable, intel, {
    markets: s.profile.markets, riskProfile: s.profile.riskProfile,
    settings: s.settings, positions: myPositions, longOnly
  })

  if (!selection.proposal) {
    status(selection.mode, selection.note, 0)
    return
  }

  const prop = selection.proposal
  status(prop.strategy, selection.note, prop.confidence)

  const price = priceOf(prop.symbol)
  if (!price) return
  // Small-account sizing floor: lift allocation so orders clear the minimum
  // trade size with ~30% headroom instead of standing aside forever.
  {
    const minTradeF = s.settings.minTradeUsd ?? 0
    const floorPct = equity > 0 && minTradeF > 0 ? (minTradeF * 1.3 / equity) * 100 : 0
    if (prop.allocationPct < floorPct && floorPct <= s.settings.maxAllocationPct) {
      prop.allocationPct = Math.round(floorPct * 10) / 10
    }
  }
  const qty = roundQty((equity * prop.allocationPct / 100) / price)
  const orderValue = qty * price

  // Dust protection: routine stand-aside, engine status only.
  const minTrade = s.settings.minTradeUsd ?? 0
  if (orderValue < minTrade) {
    status(prop.strategy,
      `Best setup (${prop.symbol}) sizes to ${orderValue.toFixed(2)} USD — below your ${minTrade} USD minimum trade size. Holding.`,
      prop.confidence)
    return
  }

  // Portfolio-capacity gate (per pipeline's own positions).
  {
    const sameMkt = myPositions.filter(x => x.market === prop.market)
    const mktAllocPct = sameMkt.reduce((a, x) => a + (x.qty * x.entryPrice / Math.max(equity, 1)) * 100, 0)
    if (mktAllocPct + prop.allocationPct > MARKET_EXPOSURE_CAP_PCT + 1e-6) {
      status(prop.strategy,
        `${prop.market} at capacity: ${mktAllocPct.toFixed(1)}% deployed across ${sameMkt.length} position(s) vs ${MARKET_EXPOSURE_CAP_PCT}% cap.`,
        prop.confidence)
      return
    }
  }

  // Liquidity gate (live only): don't bounce orders off an empty stable balance.
  if (pipeline === 'live' && s.brokerPortfolio) {
    const STABLE_SET = ['USDT', 'USDC', 'FDUSD', 'BUSD', 'DAI', 'TUSD']
    const freeStable = s.brokerPortfolio.balances
      .filter(b => STABLE_SET.includes(b.asset)).reduce((a, b) => a + (b.usd ?? 0), 0)
    const plannedValue = equity * prop.allocationPct / 100
    if (plannedValue > freeStable * 0.98) {
      status(prop.strategy,
        `Fully deployed: ${freeStable.toFixed(2)} USDT free vs ~${plannedValue.toFixed(2)} needed for the next order (${prop.symbol}).`,
        prop.confidence)
      return
    }
  }

  AuditLogger.info('STRATEGY', `${tag} Proposal: ${prop.direction} ${prop.symbol} via ${prop.strategy} (confidence ${prop.confidence})`, prop.rationale)
  const decision = RiskManager.check(prop, riskCtx(pipeline, equity, myPositions))
  const stopLoss = prop.direction === 'Long' ? price * (1 - prop.stopLossPct / 100) : price * (1 + prop.stopLossPct / 100)
  const takeProfit = prop.direction === 'Long' ? price * (1 + prop.takeProfitPct / 100) : price * (1 - prop.takeProfitPct / 100)

  const adapter = pipeline === 'live' && realBroker ? realBroker : brokers.paper
  const trade: Trade = {
    id: `tr-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
    symbol: prop.symbol, market: prop.market,
    broker: adapter.id,
    direction: prop.direction, entryPrice: price, qty,
    stopLoss: round4(stopLoss), takeProfit: round4(takeProfit),
    pnl: 0, strategy: prop.strategy, confidence: prop.confidence,
    status: 'Proposed', rationale: prop.rationale, riskChecks: decision.checks,
    regime: prop.regime, openedAt: Date.now()
  }
  useStore.getState().addTrade(trade)

  if (!decision.approved) {
    useStore.getState().patchTrade(trade.id, { status: 'Rejected', closeReason: decision.summary })
    AuditLogger.warn('RISK', `${tag} Trade rejected: ${prop.symbol}`, decision.summary)
    return
  }
  useStore.getState().patchTrade(trade.id, { status: 'Approved' })
  AuditLogger.info('RISK', `${tag} Trade approved: ${prop.symbol}`, decision.summary)

  const preview = adapter.previewOrder({
    symbol: prop.symbol, market: prop.market, direction: prop.direction,
    qty, refPrice: price, stopLoss, takeProfit, mode: pipeline
  }, useStore.getState().cash)

  if (!preview.ok) {
    useStore.getState().patchTrade(trade.id, { status: 'Rejected', closeReason: preview.note })
    AuditLogger.warn('ORDER', `${tag} Order preview failed: ${prop.symbol}`, preview.note)
    return
  }

  useStore.getState().patchTrade(trade.id, { status: 'Submitted' })
  AuditLogger.info('ORDER', `${tag} Order submitted: ${prop.direction} ${qty} ${prop.symbol}`, preview.note)
  const result = await adapter.placeOrder(preview)

  if (!result.ok || !result.fillPrice) {
    useStore.getState().patchTrade(trade.id, { status: 'Rejected', closeReason: result.reason })
    AuditLogger.error('ORDER', `${tag} Order rejected by broker: ${prop.symbol}`, result.reason)
    return
  }

  const fill = result.fillPrice
  // Ledger must track what the account REALLY holds: the venue's executed
  // quantity net of base-asset fees — not the requested qty.
  const heldQty = result.filledQty && result.filledQty > 0 ? result.filledQty : qty
  const cost = heldQty * fill + (result.commission ?? 0)
  // Only the paper ledger tracks cash; the real broker account is authoritative
  // for live fills (60s portfolio sync reflects them).
  if (adapter.id === 'paper') useStore.getState().setCash(useStore.getState().cash - cost)
  useStore.getState().patchTrade(trade.id, { status: 'Filled', entryPrice: round4(fill), qty: heldQty })
  useStore.getState().addPosition({
    tradeId: trade.id, symbol: prop.symbol, market: prop.market, direction: prop.direction,
    qty: heldQty, entryPrice: fill, broker: adapter.id,
    stopLoss: prop.direction === 'Long' ? fill * (1 - prop.stopLossPct / 100) : fill * (1 + prop.stopLossPct / 100),
    takeProfit: prop.direction === 'Long' ? fill * (1 + prop.takeProfitPct / 100) : fill * (1 - prop.takeProfitPct / 100),
    strategy: prop.strategy, confidence: prop.confidence, openedAt: Date.now()
  })
  ticksSinceTrade = 0
  AuditLogger.info('ORDER', `${tag} Fill confirmed: ${prop.direction} ${qty} ${prop.symbol} @ ${fill.toFixed(4)}`,
    `Stop ${trade.stopLoss}, target ${trade.takeProfit}. ${prop.rationale}`)
}

async function closePosition(p: Position, price: number, reason: string): Promise<void> {
  // Live positions must be closed at the broker with a REAL opposite order —
  // ledger bookkeeping alone would leave the actual position open.
  const trade = useStore.getState().trades.find(t => t.id === p.tradeId)
  let liveCommission: number | null = null
  if (trade && trade.broker !== 'paper') {
    const adapter = brokers[trade.broker]
    const closeReq = {
      symbol: p.symbol, market: p.market,
      direction: (p.direction === 'Long' ? 'Short' : 'Long') as Position['direction'],
      qty: p.qty, refPrice: price, stopLoss: 0, takeProfit: 0,
      mode: 'live' as const, reduceOnly: true
    }
    const preview = adapter.previewOrder(closeReq, Number.MAX_SAFE_INTEGER)
    const result = preview.ok ? await adapter.placeOrder(preview) : { ok: false as const, reason: preview.note }
    if (!result.ok || !('fillPrice' in result) || !result.fillPrice) {
      AuditLogger.error('ORDER', `LIVE close FAILED for ${p.symbol} — position kept open, will retry next cycle`,
        `Reason: ${'reason' in result ? result.reason : 'no fill price'}. Check the broker connection; your broker account is authoritative.`)
      return // do not touch the ledger — retry on the next tick
    }
    price = result.fillPrice
    liveCommission = 'commission' in result && typeof result.commission === 'number' ? result.commission : null
  }
  const pnl = positionPnl(p, price)
  const proceeds = positionValue(p, price)
  // Commission honesty: LIVE trades record the broker's ACTUAL fee (Binance
  // ~0.1%). The old max($1, …) floor was a paper-account assumption that
  // turned every small live win into a fake ~$1 loss. Paper keeps a floor
  // sized to its $100k ledger.
  const commission = trade && trade.broker !== 'paper'
    ? (liveCommission ?? proceeds * 0.001)
    : Math.max(1, proceeds * 0.0005)
  // Paper ledger only — live proceeds land in the real broker account, which
  // the 60s portfolio sync reflects. See the fill path for the same guard.
  if (!trade || trade.broker === 'paper') useStore.getState().setCash(useStore.getState().cash + proceeds - commission)
  useStore.getState().removePosition(p.tradeId)
  useStore.getState().patchTrade(p.tradeId, {
    status: 'Closed', exitPrice: round4(price), pnl: round2(pnl - commission),
    closedAt: Date.now(), closeReason: reason
  })
  AuditLogger[pnl >= 0 ? 'info' : 'warn']('ORDER',
    `Position closed: ${p.direction} ${p.symbol} @ ${price.toFixed(4)} — ${reason}`,
    `P&L ${pnl >= 0 ? '+' : ''}${(pnl - commission).toFixed(2)} USD after commission.`)
}

function riskCtx(pipeline: 'paper' | 'live', equity: number, positions?: Position[]): RiskContext {
  const s = useStore.getState()
  return {
    settings: s.settings, equity,
    // Per-pipeline baselines: live guards run on the real account, paper on
    // its own ledger — a $100k paper baseline must never judge a $205 account.
    dayStartEquity: pipeline === 'live' ? s.dayStartEquity : s.paperDayStart,
    peakEquity: pipeline === 'live' ? s.peakEquity : s.paperPeak,
    positions: positions ?? s.positions.filter(p => ((p.broker ?? 'paper') === 'paper') === (pipeline === 'paper')),
    mode: pipeline,
    liveUnlocked: s.liveUnlocked && s.adminApprovedLive,
    brokerHealthy: pipeline === 'live' ? !!liveAdapter() : brokers.paper.healthy(),
    emergencyStop: s.emergencyStop, killSwitch: s.killSwitch,
    // autoPaused protects the LIVE pipeline; paper keeps testing through pauses
    autoPaused: pipeline === 'live' ? s.autoPaused : false
  }
}

function roundQty(q: number): number {
  if (q >= 100) return Math.round(q)
  if (q >= 1) return Math.round(q * 100) / 100
  return Math.round(q * 10000) / 10000
}
function round2(x: number) { return Math.round(x * 100) / 100 }
function round4(x: number) { return Math.round(x * 10000) / 10000 }
