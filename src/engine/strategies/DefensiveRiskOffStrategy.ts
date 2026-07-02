import type { AssetState, IntelSnapshot, StrategySignal } from '../../types'

/**
 * DefensiveRiskOffStrategy — during elevated macro risk, rotates toward
 * defensive exposure (e.g., long gold / short high-beta assets) with
 * reduced conviction sizing. In extreme conditions it recommends standing
 * aside entirely (Cash / Risk-Off handled by the StrategySelector).
 */
export const DefensiveRiskOffStrategy = {
  name: 'Defensive Hedge' as const,
  evaluate(asset: AssetState, intel: IntelSnapshot): StrategySignal | null {
    if (intel.macroRisk < 58) return null
    const defensive = asset.market === 'Commodities' && asset.symbol.startsWith('XAU')
    const highBeta = asset.market === 'Crypto' || asset.vol > 0.4
    if (defensive) {
      const score = Math.min(85, 42 + intel.macroRisk * 0.35)
      return {
        strategy: this.name, direction: 'Long', score: Math.round(score),
        rationale: `Macro risk is elevated at ${intel.macroRisk.toFixed(0)}. Rotating toward defensive gold exposure as a hedge while risk conditions persist.`
      }
    }
    if (highBeta && intel.trend < -20) {
      const score = Math.min(80, 38 + intel.macroRisk * 0.3 + Math.abs(intel.trend) * 0.15)
      return {
        strategy: this.name, direction: 'Short', score: Math.round(score),
        rationale: `Macro risk ${intel.macroRisk.toFixed(0)} with ${asset.symbol} already weakening (trend ${intel.trend.toFixed(0)}). Defensive short on high-beta exposure to hedge portfolio risk.`
      }
    }
    return null
  }
}
