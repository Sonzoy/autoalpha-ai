import type { AssetState, IntelSnapshot, StrategySignal } from '../../types'

/**
 * SentimentMomentumStrategy — trades in the direction of strong, aligned
 * news + social sentiment when price action has begun to confirm.
 * Avoids signals when sentiment and trend conflict strongly.
 */
export const SentimentMomentumStrategy = {
  name: 'Sentiment Driven' as const,
  evaluate(asset: AssetState, intel: IntelSnapshot): StrategySignal | null {
    const combined = intel.newsSentiment * 0.6 + intel.socialSentiment * 0.4
    if (Math.abs(combined) < 32) return null
    // Strong conflict between sentiment and trend → stand aside
    if (Math.sign(combined) !== Math.sign(intel.trend) && Math.abs(intel.trend) > 35) return null
    if (intel.liquidity < 40) return null
    const direction = combined > 0 ? 'Long' : 'Short'
    const confirm = Math.sign(intel.trend) === Math.sign(combined) ? Math.abs(intel.trend) * 0.2 : 0
    const score = Math.min(92, 36 + Math.abs(combined) * 0.5 + confirm + intel.volumeAnomaly * 0.1)
    return {
      strategy: this.name,
      direction,
      score: Math.round(score),
      rationale: `Aggregated sentiment for ${asset.symbol} is ${combined.toFixed(0)} (news ${intel.newsSentiment.toFixed(0)}, social ${intel.socialSentiment.toFixed(0)}) with volume anomaly ${intel.volumeAnomaly.toFixed(0)}. Price action ${confirm > 0 ? 'confirms' : 'does not yet contradict'} the sentiment direction.`
    }
  }
}
