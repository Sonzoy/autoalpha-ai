import type { AssetState, IntelSnapshot, StrategySignal } from '../../types'

/**
 * MeanReversionStrategy — fades short-term over-extension in range-bound
 * conditions. Looks for price stretched away from its recent average while
 * the broader trend is flat and volatility is contained.
 */
export const MeanReversionStrategy = {
  name: 'Mean Reversion' as const,
  evaluate(asset: AssetState, intel: IntelSnapshot): StrategySignal | null {
    if (Math.abs(intel.trend) > 45) return null // don't fade strong trends
    if (intel.volatility > 70) return null
    const h = asset.history
    if (h.length < 30) return null
    const win = h.slice(-30)
    const mean = win.reduce((a, b) => a + b, 0) / win.length
    const devPct = ((asset.price - mean) / mean) * 100
    if (Math.abs(devPct) < 0.9) return null
    const direction = devPct > 0 ? 'Short' : 'Long'
    const score = Math.min(90, 38 + Math.abs(devPct) * 12 + Math.max(0, 50 - intel.volatility) * 0.2)
    return {
      strategy: this.name,
      direction,
      score: Math.round(score),
      rationale: `${asset.symbol} is ${Math.abs(devPct).toFixed(1)}% ${devPct > 0 ? 'above' : 'below'} its 30-bar average in a range-bound regime (trend ${intel.trend.toFixed(0)}). Positioning for reversion toward the mean.`
    }
  }
}
