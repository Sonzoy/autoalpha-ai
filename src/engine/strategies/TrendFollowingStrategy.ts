import type { AssetState, IntelSnapshot, StrategySignal } from '../../types'

/**
 * TrendFollowingStrategy — rides established directional moves.
 * Signals when momentum is strong, volatility is manageable, and
 * sentiment does not strongly contradict the trend direction.
 * (Simplified public logic; no proprietary formulas exposed.)
 */
export const TrendFollowingStrategy = {
  name: 'Trend Momentum' as const,
  evaluate(asset: AssetState, intel: IntelSnapshot): StrategySignal | null {
    const t = intel.trend
    if (Math.abs(t) < 28) return null
    if (intel.volatility > 78) return null
    const direction = t > 0 ? 'Long' : 'Short'
    const sentAligned = direction === 'Long' ? intel.newsSentiment > -30 : intel.newsSentiment < 30
    if (!sentAligned) return null
    const score = Math.min(95,
      40 + Math.abs(t) * 0.45 + Math.max(0, 60 - intel.volatility) * 0.15 + intel.liquidity * 0.08
    )
    return {
      strategy: this.name,
      direction,
      score: Math.round(score),
      rationale: `${asset.symbol} shows a ${direction === 'Long' ? 'bullish' : 'bearish'} momentum reading of ${t.toFixed(0)} with volatility at ${intel.volatility.toFixed(0)} and adequate liquidity (${intel.liquidity.toFixed(0)}). Sentiment does not contradict the move, supporting trend continuation.`
    }
  }
}
