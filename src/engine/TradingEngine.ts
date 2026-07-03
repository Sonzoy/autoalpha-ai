import { MarketSimulator } from './MarketSimulator'
import { StrategySelector } from './strategies/StrategySelector'
import { RiskManager, type RiskContext } from './RiskManager'
import { AuditLogger } from './AuditLogger'
import { PaperBrokerAdapter } from './brokers/PaperBrokerAdapter'
import { IBKRBrokerAdapter } from './brokers/IBKRBrokerAdapter'
import { EToroBrokerAdapter } from './brokers/EToroBrokerAdapter'
import { BinanceBrokerAdapter } from './brokers/BinanceBrokerAdapter'
import type { BrokerAdapter } from './brokers/BrokerAdapter'
import type { BrokerId, Position, PriceSource, Trade } from '../types'
import { MarketDataService } from './MarketDataService'
import { freshWsQuotes, startStream } from './LiveStream'
import { computeEquity, positionPnl, positionValue, useStore } from '../store/store'

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

/** The healthy real-broker adapter live orders route to (IBKR preferred). */
export function liveAdapter(): BrokerAdapter | null {
  if (brokers.ibkr.healthy()) return brokers.ibkr
  if (brokers.binance.healthy()) return brokers.binance
  return null
}

let sim: MarketSimulator | null = null
let ticksSinceTrade = 99
let busy = false
let lastUser: string | null = null
let lastLiveFetch = 0
let lastPortfolioSync = 0
let connectingPaper = false

const STABLES = new Set(['USDT', 'USDC', 'FDUSD', 'BUSD', 'DAI', 'TUSD'])

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

  // Day roll
  if (new Date().toDateString() !== st.dayStamp) {
    simulator.rollDay()
    const eq = computeEquity({ cash: st.cash, positions: st.positions, assets })
    useStore.getState().rollDay(eq)
    AuditLogger.info('SYSTEM', 'New trading day — daily P&L counters reset')
  }

  // 3. Manage open positions (stops / targets / trailing / time exit)
  const priceOf = (sym: string) => assets.find(a => a.symbol === sym)?.price ?? 0
  for (const p of [...useStore.getState().positions]) {
    const price = priceOf(p.symbol)
    if (!price) continue
    const s = useStore.getState()

    // trailing stop ratchet
    if (s.settings.trailingStopEnabled) {
      const trail = p.direction === 'Long'
        ? price * (1 - s.settings.stopLossPct / 100)
        : price * (1 + s.settings.stopLossPct / 100)
      const better = p.trailingStop === undefined ||
        (p.direction === 'Long' ? trail > p.trailingStop : trail < p.trailingStop)
      if (better) useStore.getState().patchPosition(p.tradeId, { trailingStop: trail })
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

  // 4. Equity, peak, perf, portfolio guards
  {
    const s = useStore.getState()
    const equity = computeEquity({ cash: s.cash, positions: s.positions, assets })
    if (equity > s.peakEquity) useStore.getState().setPeak(equity)
    const s2 = useStore.getState()
    const drawdown = s2.peakEquity > 0 ? ((equity - s2.peakEquity) / s2.peakEquity) * 100 : 0
    const dailyPnl = equity - s2.dayStartEquity
    useStore.getState().pushPerf({ ts: Date.now(), equity, drawdown: round2(drawdown), dailyPnl: round2(dailyPnl) })

    if (s2.autoTrading && !s2.autoPaused) {
      const guard = RiskManager.portfolioGuards(riskCtx(equity))
      if (guard) {
        useStore.getState().pauseTrading(guard)
        useStore.getState().setAutoTrading(false)
      }
    }
  }

  // 5–10. Propose → risk check → preview → execute → fill → audit
  ticksSinceTrade++
  const s = useStore.getState()
  // Clear a stale "broker unhealthy" note once the link has recovered
  // (unconditional — the note must never outlive the condition it describes)
  if (brokers.paper.healthy() && s.engineNote.startsWith('Broker link unhealthy')) {
    useStore.getState().setEngineStatus(s.engineMode, 'Scanning for qualified setups.', s.lastConfidence)
  }
  if (!s.autoTrading || s.autoPaused || s.emergencyStop || s.killSwitch) return
  if (ticksSinceTrade < 5 || Math.random() > 0.45) return
  // Don't generate proposals while the broker link is unhealthy — wait for recovery
  if (!brokers.paper.healthy()) {
    useStore.getState().setEngineStatus(s.engineMode, 'Broker link unhealthy — holding new proposals until connection recovers.', 0)
    return
  }

  // Live-data-only policy: never open trades on simulated prices unless the
  // user has explicitly allowed demo assets.
  const tradable = s.liveDataOnly
    ? assets.filter(a => (s.assetSources[a.symbol] ?? 'simulated') !== 'simulated')
    : assets
  if (s.liveDataOnly && tradable.filter(a => s.profile.markets.includes(a.market)).length === 0) {
    useStore.getState().setEngineStatus('Cash / Risk-Off',
      'Live-data-only policy: no live-priced assets in your selected markets yet. Crypto & FX feeds are automatic; add a Finnhub key or custom feeds for stocks/ETFs (Market Intel page).', 0)
    return
  }

  const selection = StrategySelector.select(tradable, intel, {
    markets: s.profile.markets, riskProfile: s.profile.riskProfile,
    settings: s.settings, positions: s.positions
  })

  if (!selection.proposal) {
    useStore.getState().setEngineStatus(selection.mode, selection.note, 0)
    if (selection.mode === 'Cash / Risk-Off') AuditLogger.info('STRATEGY', 'Engine in Cash / Risk-Off mode', selection.note)
    return
  }

  const prop = selection.proposal
  useStore.getState().setEngineStatus(prop.strategy, selection.note, prop.confidence)
  AuditLogger.info('STRATEGY', `Proposal: ${prop.direction} ${prop.symbol} via ${prop.strategy} (confidence ${prop.confidence})`, prop.rationale)

  const equity = computeEquity({ cash: s.cash, positions: s.positions, assets })
  const decision = RiskManager.check(prop, riskCtx(equity))

  const price = priceOf(prop.symbol)
  // Live mode with a synced real account: size orders from REAL equity —
  // the internal ledger is only a mirror.
  const sizingEquity = (s.tradingMode === 'live' && s.brokerPortfolio && s.brokerPortfolio.totalUsd > 0)
    ? s.brokerPortfolio.totalUsd
    : equity
  const qty = roundQty((sizingEquity * prop.allocationPct / 100) / price)
  const stopLoss = prop.direction === 'Long' ? price * (1 - prop.stopLossPct / 100) : price * (1 + prop.stopLossPct / 100)
  const takeProfit = prop.direction === 'Long' ? price * (1 + prop.takeProfitPct / 100) : price * (1 - prop.takeProfitPct / 100)

  const trade: Trade = {
    id: `tr-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
    symbol: prop.symbol, market: prop.market,
    broker: s.tradingMode === 'live' ? (liveAdapter()?.id ?? 'paper') : 'paper',
    direction: prop.direction, entryPrice: price, qty,
    stopLoss: round4(stopLoss), takeProfit: round4(takeProfit),
    pnl: 0, strategy: prop.strategy, confidence: prop.confidence,
    status: 'Proposed', rationale: prop.rationale, riskChecks: decision.checks,
    regime: prop.regime, openedAt: Date.now()
  }
  useStore.getState().addTrade(trade)

  if (!decision.approved) {
    useStore.getState().patchTrade(trade.id, { status: 'Rejected', closeReason: decision.summary })
    AuditLogger.warn('RISK', `Trade rejected: ${prop.symbol}`, decision.summary)
    return
  }
  useStore.getState().patchTrade(trade.id, { status: 'Approved' })
  AuditLogger.info('RISK', `Trade approved: ${prop.symbol}`, decision.summary)

  // Adapter routing: live mode routes to a healthy real broker (IBKR gateway
  // preferred, then Binance spot) only when the full chain is satisfied —
  // mode=live, unlock chain complete, and explicit first-order authorization.
  const realBroker = liveAdapter()
  const liveReady = s.tradingMode === 'live' && s.liveUnlocked && s.adminApprovedLive && !!realBroker
  if (s.tradingMode === 'live' && !liveReady) {
    useStore.getState().patchTrade(trade.id, { status: 'Rejected', closeReason: 'Live mode selected but live routing prerequisites are not met (unlock chain + a healthy connected broker required).' })
    AuditLogger.warn('ORDER', `Live order blocked: ${prop.symbol}`, 'Unlock chain incomplete or no healthy real broker.')
    return
  }
  if (liveReady && !s.firstLiveOrderAuthorized) {
    useStore.getState().patchTrade(trade.id, { status: 'Rejected', closeReason: 'First live order requires explicit pre-authorization (Brokers page).' })
    AuditLogger.warn('ORDER', `Live order held: ${prop.symbol}`, 'User has not pre-authorized the first live order.')
    return
  }
  const adapter = liveReady && realBroker ? realBroker : brokers.paper
  const preview = adapter.previewOrder({
    symbol: prop.symbol, market: prop.market, direction: prop.direction,
    qty, refPrice: price, stopLoss, takeProfit, mode: s.tradingMode
  }, useStore.getState().cash)

  if (!preview.ok) {
    useStore.getState().patchTrade(trade.id, { status: 'Rejected', closeReason: preview.note })
    AuditLogger.warn('ORDER', `Order preview failed: ${prop.symbol}`, preview.note)
    return
  }

  useStore.getState().patchTrade(trade.id, { status: 'Submitted' })
  AuditLogger.info('ORDER', `Order submitted: ${prop.direction} ${qty} ${prop.symbol}`, preview.note)
  const result = await adapter.placeOrder(preview)

  if (!result.ok || !result.fillPrice) {
    useStore.getState().patchTrade(trade.id, { status: 'Rejected', closeReason: result.reason })
    AuditLogger.error('ORDER', `Order rejected by broker: ${prop.symbol}`, result.reason)
    return
  }

  const fill = result.fillPrice
  const cost = qty * fill + (result.commission ?? 0)
  useStore.getState().setCash(useStore.getState().cash - cost)
  useStore.getState().patchTrade(trade.id, { status: 'Filled', entryPrice: round4(fill) })
  useStore.getState().addPosition({
    tradeId: trade.id, symbol: prop.symbol, market: prop.market, direction: prop.direction,
    qty, entryPrice: fill,
    stopLoss: prop.direction === 'Long' ? fill * (1 - prop.stopLossPct / 100) : fill * (1 + prop.stopLossPct / 100),
    takeProfit: prop.direction === 'Long' ? fill * (1 + prop.takeProfitPct / 100) : fill * (1 - prop.takeProfitPct / 100),
    strategy: prop.strategy, confidence: prop.confidence, openedAt: Date.now()
  })
  ticksSinceTrade = 0
  AuditLogger.info('ORDER', `Fill confirmed: ${prop.direction} ${qty} ${prop.symbol} @ ${fill.toFixed(4)}`,
    `Stop ${trade.stopLoss}, target ${trade.takeProfit}. ${prop.rationale}`)
}

async function closePosition(p: Position, price: number, reason: string): Promise<void> {
  // Live positions must be closed at the broker with a REAL opposite order —
  // ledger bookkeeping alone would leave the actual position open.
  const trade = useStore.getState().trades.find(t => t.id === p.tradeId)
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
  }
  const pnl = positionPnl(p, price)
  const proceeds = positionValue(p, price)
  const commission = Math.max(1, proceeds * 0.0005)
  useStore.getState().setCash(useStore.getState().cash + proceeds - commission)
  useStore.getState().removePosition(p.tradeId)
  useStore.getState().patchTrade(p.tradeId, {
    status: 'Closed', exitPrice: round4(price), pnl: round2(pnl - commission),
    closedAt: Date.now(), closeReason: reason
  })
  AuditLogger[pnl >= 0 ? 'info' : 'warn']('ORDER',
    `Position closed: ${p.direction} ${p.symbol} @ ${price.toFixed(4)} — ${reason}`,
    `P&L ${pnl >= 0 ? '+' : ''}${(pnl - commission).toFixed(2)} USD after commission.`)
}

function riskCtx(equity: number): RiskContext {
  const s = useStore.getState()
  return {
    settings: s.settings, equity,
    dayStartEquity: s.dayStartEquity, peakEquity: s.peakEquity,
    positions: s.positions, mode: s.tradingMode,
    liveUnlocked: s.liveUnlocked && s.adminApprovedLive,
    brokerHealthy: brokers.paper.healthy(),
    emergencyStop: s.emergencyStop, killSwitch: s.killSwitch, autoPaused: s.autoPaused
  }
}

function roundQty(q: number): number {
  if (q >= 100) return Math.round(q)
  if (q >= 1) return Math.round(q * 100) / 100
  return Math.round(q * 10000) / 10000
}
function round2(x: number) { return Math.round(x * 100) / 100 }
function round4(x: number) { return Math.round(x * 10000) / 10000 }
