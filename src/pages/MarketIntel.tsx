import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { useStore } from '../store/store'
import { Badge, Meter } from '../components/ui'

function scoreColor(v: number, invert = false): string {
  const x = invert ? 100 - v : v
  return x > 66 ? 'var(--green)' : x > 33 ? 'var(--amber)' : 'var(--red)'
}
function sentColor(v: number): string {
  return v > 20 ? 'var(--green)' : v < -20 ? 'var(--red)' : 'var(--amber)'
}

export default function MarketIntel() {
  const assets = useStore(s => s.assets)
  const intel = useStore(s => s.intel)
  const regime = useStore(s => s.regime)

  const snaps = assets.map(a => intel[a.symbol]).filter(Boolean)
  const avg = (f: (x: any) => number) => snaps.length ? snaps.reduce((a, x) => a + f(x), 0) / snaps.length : 0
  const macro = snaps[0]?.macroRisk ?? 0

  const alerts: { level: 'warn' | 'error'; text: string }[] = []
  if (macro > 74) alerts.push({ level: 'error', text: `Macro risk critical at ${macro.toFixed(0)}/100 — engine restricted to Risk-Off posture.` })
  else if (macro > 60) alerts.push({ level: 'warn', text: `Macro risk elevated at ${macro.toFixed(0)}/100 — allocations are being reduced automatically.` })
  for (const s of snaps) {
    if (s.volatility > 78) alerts.push({ level: 'warn', text: `${s.symbol}: extreme volatility (${s.volatility.toFixed(0)}). New momentum entries suppressed.` })
    if (s.volumeAnomaly > 80) alerts.push({ level: 'warn', text: `${s.symbol}: unusual volume detected (${s.volumeAnomaly.toFixed(0)}).` })
    const sent = s.newsSentiment * 0.6 + s.socialSentiment * 0.4
    if (Math.abs(sent) > 55 && Math.abs(s.trend) > 55 && Math.sign(sent) !== Math.sign(s.trend)) {
      alerts.push({ level: 'warn', text: `${s.symbol}: sentiment/trend conflict — asset excluded from new entries.` })
    }
  }

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="grid g4">
        <div className="card">
          <div className="stat-label">Current market regime</div>
          <div className="stat-value" style={{ fontSize: 17 }}>{regime}</div>
          <div className="stat-sub">Derived from trend, volatility, macro risk, sentiment</div>
        </div>
        <div className="card">
          <div className="stat-label">Macro risk score</div>
          <div className="stat-value" style={{ color: scoreColor(macro, true) }}>{macro.toFixed(0)}</div>
          <div className="mt"><Meter value={macro} color={scoreColor(macro, true)} /></div>
        </div>
        <div className="card">
          <div className="stat-label">Avg news sentiment</div>
          <div className="stat-value" style={{ color: sentColor(avg(x => x.newsSentiment)) }}>{avg(x => x.newsSentiment).toFixed(0)}</div>
          <div className="stat-sub">Range -100 (bearish) to +100 (bullish)</div>
        </div>
        <div className="card">
          <div className="stat-label">Avg liquidity score</div>
          <div className="stat-value" style={{ color: scoreColor(avg(x => x.liquidity)) }}>{avg(x => x.liquidity).toFixed(0)}</div>
          <div className="mt"><Meter value={avg(x => x.liquidity)} color={scoreColor(avg(x => x.liquidity))} /></div>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="card">
          <h3><AlertTriangle size={13} style={{ verticalAlign: -2 }} /> Risk alerts</h3>
          {alerts.slice(0, 6).map((a, i) => (
            <div key={i} className="row" style={{ padding: '5px 0', fontSize: 12.5, color: a.level === 'error' ? 'var(--red)' : 'var(--amber)' }}>
              <span className="dot" style={{ background: 'currentColor' }} /> {a.text}
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h3>Per-asset intelligence</h3>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Asset</th><th>Price</th><th>Trend</th><th>Volatility</th><th>News sent.</th><th>Social sent.</th><th>Liquidity</th><th>Vol. anomaly</th><th>Regime</th></tr>
            </thead>
            <tbody>
              {assets.map(a => {
                const s = intel[a.symbol]
                if (!s) return null
                return (
                  <tr key={a.symbol}>
                    <td><strong>{a.symbol}</strong> <span className="small">{a.market}</span></td>
                    <td className="mono">{a.price.toFixed(a.decimals)}</td>
                    <td className="mono" style={{ color: sentColor(s.trend) }}>{s.trend.toFixed(0)}</td>
                    <td className="mono" style={{ color: scoreColor(s.volatility, true) }}>{s.volatility.toFixed(0)}</td>
                    <td className="mono" style={{ color: sentColor(s.newsSentiment) }}>{s.newsSentiment.toFixed(0)}</td>
                    <td className="mono" style={{ color: sentColor(s.socialSentiment) }}>{s.socialSentiment.toFixed(0)}</td>
                    <td className="mono">{s.liquidity.toFixed(0)}</td>
                    <td className="mono" style={{ color: s.volumeAnomaly > 70 ? 'var(--amber)' : undefined }}>{s.volumeAnomaly.toFixed(0)}</td>
                    <td><Badge tone={s.regime === 'Trending' ? 'green' : s.regime === 'Risk-Off' ? 'red' : s.regime === 'Volatile' ? 'amber' : 'blue'}>{s.regime}</Badge></td>
                  </tr>
                )
              })}
              {assets.length === 0 && <tr><td colSpan={9} className="muted">Market data warming up…</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="small mt">Scores are generated by the simulated market-data and sentiment feeds in this build. In production these connect to real market data, news NLP, and social sentiment pipelines.</p>
      </div>
    </div>
  )
}
