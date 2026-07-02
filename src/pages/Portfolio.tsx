import React from 'react'
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useStore, computeEquity, positionPnl, positionValue } from '../store/store'
import { Badge, fmtTime, fmtUsd } from '../components/ui'
import type { Market } from '../types'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#eab308']

export default function Portfolio() {
  const cash = useStore(s => s.cash)
  const positions = useStore(s => s.positions)
  const assets = useStore(s => s.assets)
  const trades = useStore(s => s.trades)
  const perf = useStore(s => s.perf)
  const audit = useStore(s => s.audit)

  const priceOf = (sym: string) => assets.find(a => a.symbol === sym)?.price ?? 0
  const equity = computeEquity({ cash, positions, assets })
  const closed = trades.filter(t => t.status === 'Closed')
  const realized = closed.reduce((a, t) => a + t.pnl, 0)
  const unrealized = positions.reduce((a, p) => a + positionPnl(p, priceOf(p.symbol)), 0)

  const byAsset = positions.map(p => ({ name: p.symbol, value: Math.round(positionValue(p, priceOf(p.symbol))) }))
  byAsset.push({ name: 'Cash', value: Math.round(cash) })

  const byMarket: Record<string, number> = {}
  for (const p of positions) byMarket[p.market] = (byMarket[p.market] ?? 0) + positionValue(p, priceOf(p.symbol))
  const marketData = (Object.keys(byMarket) as Market[]).map(m => ({ name: m, value: Math.round(byMarket[m]) }))
  if (cash > 0) marketData.push({ name: 'Cash' as any, value: Math.round(cash) })

  const chart = perf.slice(-240).map(p => ({ t: fmtTime(p.ts), equity: Math.round(p.equity), dd: p.drawdown }))
  const syncs = audit.filter(e => e.category === 'BROKER').slice(0, 10)

  const tooltipStyle = { background: '#1c232d', border: '1px solid #263140', borderRadius: 8, fontSize: 12 }

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="grid g4">
        <div className="card"><div className="stat-label">Total equity</div><div className="stat-value">{fmtUsd(equity, 0)}</div></div>
        <div className="card"><div className="stat-label">Realized P&L</div><div className={`stat-value ${realized >= 0 ? 'pos' : 'neg'}`}>{fmtUsd(realized)}</div></div>
        <div className="card"><div className="stat-label">Unrealized P&L</div><div className={`stat-value ${unrealized >= 0 ? 'pos' : 'neg'}`}>{fmtUsd(unrealized)}</div></div>
        <div className="card"><div className="stat-label">Cash balance</div><div className="stat-value">{fmtUsd(cash, 0)}</div></div>
      </div>

      <div className="grid g2">
        <div className="card">
          <h3>Allocation by asset</h3>
          <div style={{ height: 210 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={byAsset} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {byAsset.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => fmtUsd(Number(v), 0)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="row wrap">
            {byAsset.map((d, i) => (
              <span key={d.name} className="small"><span style={{ color: COLORS[i % COLORS.length] }}>●</span> {d.name}</span>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>Allocation by market</h3>
          <div style={{ height: 210 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={marketData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {marketData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => fmtUsd(Number(v), 0)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="row wrap">
            {marketData.map((d, i) => (
              <span key={d.name} className="small"><span style={{ color: COLORS[i % COLORS.length] }}>●</span> {d.name}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <h3>Performance</h3>
          <div style={{ height: 180 }}>
            <ResponsiveContainer>
              <AreaChart data={chart}>
                <defs><linearGradient id="pf" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--green)" stopOpacity={0.3} /><stop offset="100%" stopColor="var(--green)" stopOpacity={0} />
                </linearGradient></defs>
                <XAxis dataKey="t" hide /><YAxis domain={['auto', 'auto']} width={70} tick={{ fill: '#63718a', fontSize: 11 }} tickFormatter={v => '$' + Number(v).toLocaleString()} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="equity" stroke="var(--green)" fill="url(#pf)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h3>Drawdown</h3>
          <div style={{ height: 180 }}>
            <ResponsiveContainer>
              <AreaChart data={chart}>
                <defs><linearGradient id="dd" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--red)" stopOpacity={0} /><stop offset="100%" stopColor="var(--red)" stopOpacity={0.35} />
                </linearGradient></defs>
                <XAxis dataKey="t" hide /><YAxis domain={['auto', 0]} width={50} tick={{ fill: '#63718a', fontSize: 11 }} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => `${v}%`} />
                <Area type="monotone" dataKey="dd" stroke="var(--red)" fill="url(#dd)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <h3>Open positions</h3>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Asset</th><th>Dir</th><th>Qty</th><th>Entry</th><th>Value</th><th>Unrealized</th></tr></thead>
              <tbody>
                {positions.length === 0 && <tr><td colSpan={6} className="muted">No open positions.</td></tr>}
                {positions.map(p => {
                  const px = priceOf(p.symbol); const pnl = positionPnl(p, px)
                  return (
                    <tr key={p.tradeId}>
                      <td><strong>{p.symbol}</strong></td>
                      <td><Badge tone={p.direction === 'Long' ? 'green' : 'red'}>{p.direction}</Badge></td>
                      <td className="mono">{p.qty}</td>
                      <td className="mono">{p.entryPrice.toFixed(2)}</td>
                      <td className="mono">{fmtUsd(positionValue(p, px), 0)}</td>
                      <td className={`mono ${pnl >= 0 ? 'pos' : 'neg'}`}>{fmtUsd(pnl)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h3>Broker sync history</h3>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Time</th><th>Event</th></tr></thead>
              <tbody>
                {syncs.length === 0 && <tr><td colSpan={2} className="muted">No broker events yet.</td></tr>}
                {syncs.map(e => (
                  <tr key={e.id}><td className="small">{fmtTime(e.ts)}</td><td className="small">{e.message}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
