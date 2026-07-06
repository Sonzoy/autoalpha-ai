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
  const tradingMode = useStore(s => s.tradingMode)
  const brokerPortfolio = useStore(s => s.brokerPortfolio)

  const priceOf = (sym: string) => assets.find(a => a.symbol === sym)?.price ?? 0
  const equity = computeEquity({ cash, positions, assets })
  const liveAcct = tradingMode === 'live' && brokerPortfolio && brokerPortfolio.totalUsd > 0
  const displayedEquity = liveAcct ? brokerPortfolio!.totalUsd : equity
  const closed = trades.filter(t => t.status === 'Closed')
  const realized = closed.reduce((a, t) => a + t.pnl, 0)
  const unrealized = positions.reduce((a, p) => a + positionPnl(p, priceOf(p.symbol)), 0)

  const byAsset = liveAcct
    ? brokerPortfolio!.balances
      .filter(b => b.usd !== null && b.usd > 0)
      .map(b => ({ name: b.asset, value: Math.round(b.usd!) }))
    : positions.map(p => ({ name: p.symbol, value: Math.round(positionValue(p, priceOf(p.symbol))) }))
  if (!liveAcct) byAsset.push({ name: 'Cash', value: Math.round(cash) })

  const byMarket: Record<string, number> = {}
  for (const p of positions) byMarket[p.market] = (byMarket[p.market] ?? 0) + positionValue(p, priceOf(p.symbol))
  const marketData = liveAcct
    ? byAsset.map(d => ({ name: d.name as any, value: d.value }))
    : (Object.keys(byMarket) as Market[]).map(m => ({ name: m, value: Math.round(byMarket[m]) }))
  if (!liveAcct && cash > 0) marketData.push({ name: 'Cash' as any, value: Math.round(cash) })

  const chart = perf.slice(-240).map(p => ({ t: fmtTime(p.ts), equity: Math.round(p.equity), dd: p.drawdown }))
  const syncs = audit.filter(e => e.category === 'BROKER').slice(0, 10)

  const tooltipStyle = { background: '#1c232d', border: '1px solid #263140', borderRadius: 8, fontSize: 12 }

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="grid g4">
        <div className="card"><div className="stat-label">{liveAcct ? `${brokerPortfolio!.broker.toUpperCase()} account value` : 'Total equity'}</div><div className="stat-value">{fmtUsd(displayedEquity, 0)}</div></div>
        <div className="card"><div className="stat-label">{liveAcct ? 'Synced holdings' : 'Realized P&L'}</div><div className={`stat-value ${!liveAcct && realized < 0 ? 'neg' : 'pos'}`}>{liveAcct ? brokerPortfolio!.balances.length : fmtUsd(realized)}</div></div>
        <div className="card"><div className="stat-label">{liveAcct ? 'Broker source' : 'Unrealized P&L'}</div><div className={`stat-value ${!liveAcct && unrealized < 0 ? 'neg' : 'pos'}`}>{liveAcct ? brokerPortfolio!.broker.toUpperCase() : fmtUsd(unrealized)}</div></div>
        <div className="card"><div className="stat-label">{liveAcct ? 'Available to trade' : 'Cash balance'}</div><div className="stat-value">{fmtUsd(liveAcct
          ? brokerPortfolio!.balances.filter(b => ['USDT', 'USDC', 'FDUSD', 'BUSD', 'DAI', 'TUSD'].includes(b.asset)).reduce((a, b) => a + (b.usd ?? 0), 0)
          : cash, 0)}</div></div>
      </div>

      <div className="grid g2">
        <div className="card">
          <h3>{liveAcct ? 'Broker allocation by asset' : 'Allocation by asset'}</h3>
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
          <h3>{liveAcct ? 'Broker balances' : 'Allocation by market'}</h3>
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
          <h3>{liveAcct ? 'Real broker holdings' : 'Open positions'}</h3>
          <div className="tbl-wrap">
            {liveAcct ? (
              <table className="tbl">
                <thead><tr><th>Asset</th><th>Qty</th><th>USD value</th><th>Authoritative source</th></tr></thead>
                <tbody>
                  {brokerPortfolio!.balances.length === 0 && <tr><td colSpan={4} className="muted">No synced broker balances yet.</td></tr>}
                  {brokerPortfolio!.balances.map(b => (
                    <tr key={b.asset}>
                      <td><strong>{b.asset}</strong></td>
                      <td className="mono">{b.qty < 1 ? b.qty.toFixed(8) : b.qty.toFixed(4)}</td>
                      <td className="mono">{b.usd !== null ? fmtUsd(b.usd, 0) : 'Needs price feed'}</td>
                      <td><Badge tone="green">{brokerPortfolio!.broker.toUpperCase()}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
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
            )}
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
