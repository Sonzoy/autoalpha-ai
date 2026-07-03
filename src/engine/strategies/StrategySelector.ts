import type {
  AssetState, IntelSnapshot, Market, Position, RiskProfile,
  RiskSettings, StrategyName, StrategySignal, TradeProposal
} from '../../types'
import { TrendFollowingStrategy } from './TrendFollowingStrategy'
import { MeanReversionStrategy } from './MeanReversionStrategy'
import { SentimentMomentumStrategy } from './SentimentMomentumStrategy'
import { DefensiveRiskOffStrategy } from './DefensiveRiskOffStrategy'

/**
 * StrategySelector — detects the market regime per asset, routes each asset
 * to the strategies suited to its regime and asset class, scores candidate
 * signals, and emits at most one risk-profile-adjusted trade proposal.
 *
 * Hard blocks:
 *  - Extreme risk conditions (macro risk > 85) → Cash / Risk-Off, no trades.
 *  - Strong sentiment/trend conflict → skip asset.
 *  - High volatility → allocation scaled down before the RiskManager cap.
 */

export interface SelectorContext {
  markets: Market[]
  riskProfile: RiskProfile
  settings: RiskSettings
  positions: Position[]
}

export interface SelectorResult {
  proposal: TradeProposal | null
  mode: StrategyName // current engine mode, Cash / Risk-Off when standing aside
  note: string
}

const PROFILE_ALLOC: Record<RiskProfile, number> = { Conservative: 2, Balanced: 5, Aggressive: 10 }

export const StrategySelector = {
  select(assets: AssetState[], intel: Record<string, IntelSnapshot>, ctx: SelectorContext): SelectorResult {
    const universe = assets.filter(a => ctx.markets.includes(a.market))
    if (!universe.length) return { proposal: null, mode: 'Cash / Risk-Off', note: 'No markets selected.' }

    const macro = intel[universe[0].symbol]?.macroRisk ?? 50
    if (macro > 85) {
      return {
        proposal: null, mode: 'Cash / Risk-Off',
        note: `Extreme macro risk (${macro.toFixed(0)}/100). All new entries blocked; engine in Cash / Risk-Off mode until conditions normalize.`
      }
    }

    const held = new Set(ctx.positions.map(p => p.symbol))
    let best: { signal: StrategySignal; asset: AssetState; snap: IntelSnapshot } | null = null

    for (const asset of universe) {
      const snap = intel[asset.symbol]
      if (!snap) continue
      if (held.has(asset.symbol)) continue
      // Data-sufficiency guard: never signal on thin history
      if (asset.history.length < 40) continue
      // Liquidity floor: illiquid conditions distort fills; stand aside
      if (snap.liquidity < 35) continue
      // Strong sentiment vs trend conflict → avoid the asset entirely
      const sent = snap.newsSentiment * 0.6 + snap.socialSentiment * 0.4
      if (Math.abs(sent) > 55 && Math.abs(snap.trend) > 55 && Math.sign(sent) !== Math.sign(snap.trend)) continue

      // Route by regime; asset class influences which strategies are tried
      const candidates = []
      switch (snap.regime) {
        case 'Trending':
          candidates.push(TrendFollowingStrategy, SentimentMomentumStrategy); break
        case 'Ranging':
          candidates.push(MeanReversionStrategy, SentimentMomentumStrategy); break
        case 'Volatile':
          candidates.push(DefensiveRiskOffStrategy, MeanReversionStrategy); break
        case 'Risk-Off':
          candidates.push(DefensiveRiskOffStrategy); break
      }
      // Crypto reacts strongly to social sentiment; always consider it there
      if (asset.market === 'Crypto' && !candidates.includes(SentimentMomentumStrategy)) {
        candidates.push(SentimentMomentumStrategy)
      }

      for (const strat of candidates) {
        const sig = strat.evaluate(asset, snap)
        if (sig && (!best || sig.score > best.signal.score)) best = { signal: sig, asset, snap }
      }
    }

    if (!best || best.signal.score < 50) {
      const mode: StrategyName = macro > 70 ? 'Cash / Risk-Off' : (best ? best.signal.strategy : 'Cash / Risk-Off')
      return {
        proposal: null, mode,
        note: best
          ? `Best candidate (${best.asset.symbol}, score ${best.signal.score}) below the 50-conviction threshold. Standing aside.`
          : 'No strategy produced a qualifying signal this cycle. Standing aside preserves capital.'
      }
    }

    // Allocation: profile base, scaled down by volatility and macro risk
    let alloc = PROFILE_ALLOC[ctx.riskProfile]
    const volPenalty = best.snap.volatility > 55 ? 1 - (best.snap.volatility - 55) / 90 : 1
    const macroPenalty = macro > 60 ? 1 - (macro - 60) / 100 : 1
    alloc = Math.max(0.5, alloc * volPenalty * macroPenalty)
    alloc = Math.min(alloc, ctx.settings.maxAllocationPct)

    // Wider spread: scale score down and cap the liquidity bonus so values
    // don't cluster in the 90s
    const confidence = Math.max(50, Math.min(95, Math.round(best.signal.score * 0.9 + (best.snap.liquidity - 50) / 10)))

    return {
      mode: best.signal.strategy,
      note: `Selected ${best.signal.strategy} on ${best.asset.symbol} (regime: ${best.snap.regime}).`,
      proposal: {
        symbol: best.asset.symbol,
        market: best.asset.market,
        direction: best.signal.direction,
        strategy: best.signal.strategy,
        confidence,
        allocationPct: Math.round(alloc * 10) / 10,
        stopLossPct: ctx.settings.stopLossPct,
        takeProfitPct: ctx.settings.takeProfitPct,
        rationale: best.signal.rationale +
          (volPenalty < 1 ? ` Allocation reduced ${Math.round((1 - volPenalty) * 100)}% for elevated volatility.` : '') +
          (macroPenalty < 1 ? ` Allocation reduced ${Math.round((1 - macroPenalty) * 100)}% for macro risk.` : ''),
        regime: best.snap.regime
      }
    }
  }
}
