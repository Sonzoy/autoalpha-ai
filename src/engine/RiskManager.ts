import type {
  Position, RiskCheck, RiskDecision, RiskSettings, TradeProposal, TradingMode
} from '../types'

/**
 * RiskManager — every proposed trade passes through here before execution.
 * Approves or rejects with a full, logged reason for each check.
 */

export interface RiskContext {
  settings: RiskSettings
  equity: number
  dayStartEquity: number
  peakEquity: number
  positions: Position[]
  mode: TradingMode
  liveUnlocked: boolean
  brokerHealthy: boolean
  emergencyStop: boolean
  killSwitch: boolean
  autoPaused: boolean
}

const MARKET_EXPOSURE_CAP_PCT = 20 // max combined allocation to one market (correlated assets)
const MAX_OPEN_POSITIONS = 8

export const RiskManager = {
  check(p: TradeProposal, ctx: RiskContext): RiskDecision {
    const checks: RiskCheck[] = []
    const add = (name: string, passed: boolean, detail: string) => checks.push({ name, passed, detail })

    // 1. Emergency / kill switch
    add('Emergency stop', !ctx.emergencyStop,
      ctx.emergencyStop ? 'User emergency stop is active. All new trades blocked.' : 'Emergency stop not active.')
    add('Platform kill switch', !ctx.killSwitch,
      ctx.killSwitch ? 'Admin kill switch is engaged platform-wide.' : 'Kill switch not engaged.')
    add('Auto-pause status', !ctx.autoPaused,
      ctx.autoPaused ? 'Trading auto-paused by a prior risk breach. Manual resume required.' : 'No active auto-pause.')

    // 2. Allocation cap
    const allocOk = p.allocationPct <= ctx.settings.maxAllocationPct + 1e-9
    add('Max allocation per trade', allocOk,
      `Proposed ${p.allocationPct}% vs limit ${ctx.settings.maxAllocationPct}%.`)

    // 3. Daily loss limit
    const dayPnlPct = ctx.dayStartEquity > 0 ? ((ctx.equity - ctx.dayStartEquity) / ctx.dayStartEquity) * 100 : 0
    const dailyOk = dayPnlPct > -ctx.settings.dailyLossLimitPct
    add('Daily loss limit', dailyOk,
      `Day P&L ${dayPnlPct.toFixed(2)}% vs limit -${ctx.settings.dailyLossLimitPct}%.`)

    // 4. Max drawdown
    const ddPct = ctx.peakEquity > 0 ? ((ctx.equity - ctx.peakEquity) / ctx.peakEquity) * 100 : 0
    const ddOk = ddPct > -ctx.settings.maxDrawdownPct
    add('Max drawdown pause', ddOk,
      `Drawdown ${ddPct.toFixed(2)}% vs pause threshold -${ctx.settings.maxDrawdownPct}%.`)

    // 5. Stop loss present when required
    add('Stop loss configured', !ctx.settings.stopLossEnabled || p.stopLossPct > 0,
      ctx.settings.stopLossEnabled ? `Stop loss ${p.stopLossPct}% attached.` : 'Stop loss enforcement disabled by user.')

    // 6. Correlated overexposure: cap combined exposure to a single market
    const samePositions = ctx.positions.filter(x => x.market === p.market)
    const sameMarketAlloc = samePositions.reduce((a, x) => a + (x.qty * x.entryPrice / Math.max(ctx.equity, 1)) * 100, 0)
    const corrOk = sameMarketAlloc + p.allocationPct <= MARKET_EXPOSURE_CAP_PCT
    add('Correlated exposure', corrOk,
      `${p.market} exposure would be ${(sameMarketAlloc + p.allocationPct).toFixed(1)}% vs ${MARKET_EXPOSURE_CAP_PCT}% cap (${samePositions.length} open correlated position(s)).`)

    // 7. Duplicate position
    const dupOk = !ctx.positions.some(x => x.symbol === p.symbol)
    add('Duplicate position', dupOk, dupOk ? `No existing position in ${p.symbol}.` : `Already holding ${p.symbol}.`)

    // 8. Position count
    add('Open position count', ctx.positions.length < MAX_OPEN_POSITIONS,
      `${ctx.positions.length}/${MAX_OPEN_POSITIONS} positions open.`)

    // 9. Broker health
    add('Broker connection health', ctx.brokerHealthy,
      ctx.brokerHealthy ? 'Broker link healthy.' : 'Broker connection unhealthy — orders blocked until link recovers.')

    // 10. Live trading lock
    const liveOk = ctx.mode === 'paper' || ctx.liveUnlocked
    add('Live trading authorization', liveOk,
      ctx.mode === 'paper' ? 'Paper mode — live lock not applicable.'
        : ctx.liveUnlocked ? 'Live trading explicitly unlocked and admin-approved.'
          : 'Live trading is locked. Requires broker connection, permissions, compliance review, and explicit authorization.')

    const failed = checks.filter(c => !c.passed)
    return {
      approved: failed.length === 0,
      checks,
      summary: failed.length === 0
        ? `Approved: all ${checks.length} risk checks passed.`
        : `Rejected: ${failed.map(f => f.name).join('; ')}.`
    }
  },

  /** Post-trade portfolio guards — returns a pause reason or null. */
  portfolioGuards(ctx: RiskContext): string | null {
    const dayPnlPct = ctx.dayStartEquity > 0 ? ((ctx.equity - ctx.dayStartEquity) / ctx.dayStartEquity) * 100 : 0
    if (dayPnlPct <= -ctx.settings.dailyLossLimitPct) {
      return `Daily loss limit reached (${dayPnlPct.toFixed(2)}% ≤ -${ctx.settings.dailyLossLimitPct}%). Auto-trading paused for the day.`
    }
    const ddPct = ctx.peakEquity > 0 ? ((ctx.equity - ctx.peakEquity) / ctx.peakEquity) * 100 : 0
    if (ddPct <= -ctx.settings.maxDrawdownPct) {
      return `Max drawdown threshold reached (${ddPct.toFixed(2)}% ≤ -${ctx.settings.maxDrawdownPct}%). Auto-trading paused pending review.`
    }
    return null
  }
}
