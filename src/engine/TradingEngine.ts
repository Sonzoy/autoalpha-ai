import { MarketSimulator } from './MarketSimulator'
import { StrategySelector } from './strategies/StrategySelector'
import { RiskManager, type RiskContext } from './RiskManager'
import { AuditLogger } from './AuditLogger'
import { PaperBrokerAdapter } from './brokers/PaperBrokerAdapter'
import { IBKRBrokerAdapter } from './brokers/IBKRBrokerAdapter'
import { EToroBrokerAdapter } from './brokers/EToroBrokerAdapter'
import type { BrokerAdapter } from './brokers/BrokerAdapter'
import type { BrokerId, Position, Trade } from '../types'
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
  etoro: new EToroBrokerAdapter()
}

let sim: MarketSimulator | null = null
let ticksSinceTrade = 99
let busy = false

export function getSimulator(): MarketSimulator {
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

  // 1–2. Market data + sentiment update
  const simulator = getSimulator()
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
    // time-based exit: ~200 ticks max hold
    if (!closeReason && Date.now() - pos.openedAt > 200 * 2500) closeReason = 'Max holding period reached'
    // emergency stop / kill switch flatten
    if (!closeReason && (s.emergencyStop || s.killSwitch)) closeReason = s.killSwitch ? 'Kill switch: flattening positions' : 'Emergency stop: flattening positions'

    if (closeReason) closePosition(pos, price, closeReason)
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
  if (!s.autoTrading || s.autoPaused || s.emergencyStop || s.killSwitch) return
  if (ticksSinceTrade < 5 || Math.random() > 0.45) return
  // Don't generate proposals while the broker link is unhealthy — wait for recovery
  if (!brokers.paper.healthy()) {
    useStore.getState().setEngineStatus(s.engineMode, 'Broker link unhealthy — holding new proposals until connection recovers.', 0)
    return
  }

  const selection = StrategySelector.select(assets, intel, {
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
  const qty = roundQty((equity * prop.allocationPct / 100) / price)
  const stopLoss = prop.direction === 'Long' ? price * (1 - prop.stopLossPct / 100) : price * (1 + prop.stopLossPct / 100)
  const takeProfit = prop.direction === 'Long' ? price * (1 + prop.takeProfitPct / 100) : price * (1 - prop.takeProfitPct / 100)

  const trade: Trade = {
    id: `tr-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
    symbol: prop.symbol, market: prop.market, broker: 'paper',
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

  const adapter = brokers.paper // live routing stays locked in this build
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

function closePosition(p: Position, price: number, reason: string): void {
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
