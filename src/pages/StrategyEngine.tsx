import React, { useState } from 'react'
import { useStore } from '../store/store'
import { Badge, fmtTime, statusTone } from '../components/ui'
import type { Trade } from '../types'

const STRATEGIES = [
  { name: 'Trend Momentum', desc: 'Rides established directional moves when momentum is strong, volatility is manageable, and sentiment does not contradict the trend. Suited to trending regimes across all asset classes.' },
  { name: 'Mean Reversion', desc: 'Fades short-term over-extension in range-bound conditions, positioning for a return toward the recent average. Avoids fighting strong trends or extreme volatility.' },
  { name: 'Sentiment Driven', desc: 'Trades in the direction of strong, aligned news and social sentiment once price action begins to confirm. Weighted more heavily for crypto, where sentiment moves markets fastest.' },
  { name: 'Defensive Hedge', desc: 'Under elevated macro risk, rotates toward defensive exposure (e.g., gold) or hedging shorts on weakening high-beta assets, with reduced sizing.' },
  { name: 'Cash / Risk-Off', desc: 'When conditions are extreme or no signal clears the conviction threshold, the engine stands aside entirely. Not trading is a position.' }
]

export default function StrategyEngine() {
  const trades = useStore(s => s.trades)
  const engineMode = useStore(s => s.engineMode)
  const engineNote = useStore(s => s.engineNote)
  const regime = useStore(s => s.regime)
  const [sel, setSel] = useState<Trade | null>(null)

  const decisions = trades.slice(0, 30)

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="card">
        <div className="row spread wrap">
          <div>
            <h3>Current engine state</h3>
            <div className="row wrap">
              <Badge tone="blue">Mode: {engineMode}</Badge>
              <Badge tone={regime === 'Risk-Off' ? 'red' : regime === 'Volatile' ? 'amber' : 'green'}>Regime: {regime}</Badge>
            </div>
            <p className="muted mt">{engineNote}</p>
          </div>
        </div>
        <p className="small mt">Strategies are selected automatically per asset based on detected regime and asset class — trend and volatility route to momentum or reversion, sentiment weighs heaviest in crypto, and elevated macro risk shifts the engine defensive. Simplified logic is shown for transparency; exact signal parameters are proprietary.</p>
      </div>

      <div className="grid g3">
        {STRATEGIES.map(s => (
          <div key={s.name} className="card" style={s.name === engineMode ? { borderColor: 'var(--blue)' } : undefined}>
            <div className="row spread">
              <h3 style={{ marginBottom: 6 }}>{s.name}</h3>
              {s.name === engineMode && <Badge tone="blue">ACTIVE</Badge>}
            </div>
            <p className="small">{s.desc}</p>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>AI decisions — click a row for the full reasoning and risk checks</h3>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Time</th><th>Asset</th><th>Strategy</th><th>Regime</th><th>Dir</th><th>Confidence</th><th>Stop</th><th>Target</th><th>Status</th></tr></thead>
            <tbody>
              {decisions.length === 0 && <tr><td colSpan={9} className="muted">No decisions yet — enable AI trading on the dashboard.</td></tr>}
              {decisions.map(t => (
                <tr key={t.id} onClick={() => setSel(t)} style={{ cursor: 'pointer' }}>
                  <td className="small">{fmtTime(t.openedAt)}</td>
                  <td><strong>{t.symbol}</strong></td>
                  <td className="small">{t.strategy}</td>
                  <td className="small">{t.regime}</td>
                  <td><Badge tone={t.direction === 'Long' ? 'green' : 'red'}>{t.direction}</Badge></td>
                  <td className="mono">{t.confidence}</td>
                  <td className="mono">{t.stopLoss.toFixed(2)}</td>
                  <td className="mono">{t.takeProfit.toFixed(2)}</td>
                  <td><Badge tone={statusTone(t.status)}>{t.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {sel && (
        <div className="modal-overlay" onClick={() => setSel(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{sel.direction} {sel.symbol} — {sel.strategy}</h2>
            <div className="row wrap mb">
              <Badge tone={statusTone(sel.status)}>{sel.status}</Badge>
              <Badge tone="blue">Confidence {sel.confidence}</Badge>
              <Badge tone="gray">Regime: {sel.regime}</Badge>
            </div>
            <p><strong>Why this trade was selected:</strong><br />{sel.rationale}</p>
            {sel.closeReason && <p><strong>Outcome / rejection note:</strong><br />{sel.closeReason}</p>}
            <h3 style={{ margin: '12px 0 8px' }}>Risk engine checks</h3>
            {sel.riskChecks.map((c, i) => (
              <div key={i} className="row" style={{ padding: '5px 0', borderBottom: '1px solid var(--border-2)', fontSize: 12.5 }}>
                <span style={{ color: c.passed ? 'var(--green)' : 'var(--red)', fontWeight: 700, width: 16 }}>{c.passed ? '✓' : '✗'}</span>
                <span style={{ flex: 1 }}><strong>{c.name}.</strong> <span className="muted">{c.detail}</span></span>
              </div>
            ))}
            <button className="btn mt" onClick={() => setSel(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
