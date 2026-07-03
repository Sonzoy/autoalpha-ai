import React from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useStore, computeEquity, positionPnl, START_CASH } from '../store/store'
import { Badge, Stat, fmtPct, fmtUsd, fmtTime, statusTone } from '../components/ui'

export default function Dashboard() {
  const cash = useStore(s => s.cash)
  const positions = useStore(s => s.positions)
  const assets = useStore(s => s.assets)
  const trades = useStore(s => s.trades)
  const perf = useStore(s => s.perf)
  const dayStartEquity = useStore(s => s.dayStartEquity)
  const peakEquity = useStore(s => s.peakEquity)
  const engineMode = useStore(s => s.engineMode)
  const engineNote = useStore(s => s.engineNote)
  const lastConfidence = useStore(s => s.lastConfidence)
  const regime = useStore(s => s.regime)
  const autoTrading = useStore(s => s.autoTrading)
  const autoPaused = useStore(s => s.autoPaused)
  const pauseReason = useStore(s => s.pauseReason)
  const resumeTrading = useStore(s => s.resumeTrading)

  const equity = computeEquity({ cash, positions, assets })
  const dailyPnl = equity - dayStartEquity
  const dailyPct = dayStartEquity ? (dailyPnl / dayStartEquity) * 100 : 0
  const totalPct = ((equity - START_CASH) / START_CASH) * 100
  const drawdown = peakEquity ? ((equity - peakEquity) / peakEquity) * 100 : 0
  const closed = trades.filter(t => t.status === 'Closed')
  const wins = closed.filter(t => t.pnl > 0).length
  const winRate = closed.length ? (wins / closed.length) * 100 : 0
  const priceOf = (sym: string) => assets.find(a => a.symbol === sym)?.price ?? 0
  const chart = perf.slice(-240).map(p => ({ t: fmtTime(p.ts), equity: Math.round(p.equity) }))

  return (
    <div className="grid" style={{ gap: 14 }}>
      {autoPaused && (
        <div className="disclaimer-box row spread wrap">
          <span><strong>Risk engine pause:</strong> {pauseReason}</span>
          <button className="btn sm" onClick={resumeTrading}>Acknowledge & resume</button>
        </div>
      )}

      <div className="grid g4">
        <Stat label="Portfolio value" value={fmtUsd(equity, 0)} sub={`Cash ${fmtUsd(cash, 0)}`} />
        <Stat label="Daily P&L" value={fmtUsd(dailyPnl)} sub={fmtPct(dailyPct)} tone={dailyPnl >= 0 ? 'pos' : 'neg'} />
        <Stat label="Total return" value={fmtPct(totalPct)} sub={`vs ${fmtUsd(START_CASH, 0)} start`} tone={totalPct >= 0 ? 'pos' : 'neg'} />
        <Stat label="Drawdown" value={`${drawdown.toFixed(2)}%`} sub={`Peak ${fmtUsd(peakEquity, 0)}`} tone={drawdown < -3 ? 'neg' : 'warn'} />
      </div>

      <div className="grid g4">
        <Stat label="Open positions" value={positions.length} sub={`${trades.filter(t => t.status === 'Filled').length} open fills`} />
        <Stat label="Win rate (closed)" value={closed.length ? `${winRate.toFixed(0)}%` : '—'} sub={`${wins}W / ${closed.length - wins}L of ${closed.length}`} tone={winRate >= 50 ? 'pos' : 'warn'} />
        <Stat label="Active strategy mode" value={<span style={{ fontSize: 15 }}>{engineMode}</span>} sub={autoTrading ? 'AI trading active' : 'AI trading off'} tone="info" />
        <Stat label="AI confidence" value={lastConfidence ? `${lastConfidence}` : '—'} sub={`Market regime: ${regime}`} tone="info" />
      </div>

      <div className="card">
        <h3>Equity curve (paper account)</h3>
        <div style={{ height: 220 }}>
          <ResponsiveContainer>
            <AreaChart data={chart}>
              <defs>
                <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--blue)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--blue)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" hide />
              <YAxis domain={['auto', 'auto']} width={70} tick={{ fill: '#63718a', fontSize: 11 }} tickFormatter={v => '$' + Number(v).toLocaleString()} />
              <Tooltip contentStyle={{ background: '#1c232d', border: '1px solid #263140', borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="equity" stroke="var(--blue)" fill="url(#eq)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <h3>Open positions</h3>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Asset</th><th>Dir</th><th>Qty</th><th>Entry</th><th>Now</th><th>Unrealized</th><th>Strategy</th></tr></thead>
              <tbody>
                {positions.length === 0 && <tr><td colSpan={7} className="muted">No open positions. {autoTrading ? 'The engine is scanning for qualified setups.' : 'Enable AI trading to start.'}</td></tr>}
                {positions.map(p => {
                  const px = priceOf(p.symbol)
                  const pnl = positionPnl(p, px)
                  return (
                    <tr key={p.tradeId}>
                      <td><strong>{p.symbol}</strong></td>
                      <td><Badge tone={p.direction === 'Long' ? 'green' : 'red'}>{p.direction}</Badge></td>
                      <td className="mono">{p.qty}</td>
                      <td className="mono">{p.entryPrice.toFixed(2)}</td>
                      <td className="mono">{px.toFixed(2)}</td>
                      <td className={`mono ${pnl >= 0 ? 'pos' : 'neg'}`}>{fmtUsd(pnl)}</td>
                      <td className="small">{p.strategy}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3>Latest AI activity</h3>
          <p className="muted mb">{engineNote}</p>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Time</th><th>Asset</th><th>Status</th><th>Strategy</th><th>P&L</th></tr></thead>
              <tbody>
                {trades.slice(0, 8).map(t => (
                  <tr key={t.id}>
                    <td className="small">{fmtTime(t.openedAt)}</td>
                    <td><strong>{t.symbol}</strong></td>
                    <td><Badge tone={statusTone(t.status)}>{t.status}</Badge></td>
                    <td className="small">{t.strategy}</td>
                    <td className={`mono ${t.pnl >= 0 ? 'pos' : 'neg'}`}>{t.status === 'Closed' ? fmtUsd(t.pnl) : '—'}</td>
                  </tr>
                ))}
                {trades.length === 0 && <tr><td colSpan={5} className="muted">No trades yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
