import React from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Bot, PauseCircle } from 'lucide-react'
import { useStore, modeOfBroker, paperEquity, positionPnl, realizedWinRateFor, START_CASH } from '../store/store'
import { Badge, Meter, Segmented, fmtPct, fmtUsd, fmtTime, statusTone } from '../components/ui'

export default function Dashboard() {
  const cash = useStore(s => s.cash)
  const allPositions = useStore(s => s.positions)
  const assets = useStore(s => s.assets)
  const allTrades = useStore(s => s.trades)
  const allPerf = useStore(s => s.perf)
  const dayStartLive = useStore(s => s.dayStartEquity)
  const peakLive = useStore(s => s.peakEquity)
  const paperDayStart = useStore(s => s.paperDayStart)
  const paperPeak = useStore(s => s.paperPeak)
  const engineMode = useStore(s => s.engineMode)
  const engineNote = useStore(s => s.engineNote)
  const lastConfidence = useStore(s => s.lastConfidence)
  const regime = useStore(s => s.regime)
  const autoTrading = useStore(s => s.autoTrading)
  const autoPaused = useStore(s => s.autoPaused)
  const pauseReason = useStore(s => s.pauseReason)
  const resumeTrading = useStore(s => s.resumeTrading)
  const speed = useStore(s => s.speed)
  const setSpeed = useStore(s => s.setSpeed)
  const assetSources = useStore(s => s.assetSources)
  const tradingMode = useStore(s => s.tradingMode)
  const brokerPortfolio = useStore(s => s.brokerPortfolio)
  const liveAcct = tradingMode === 'live' && brokerPortfolio && brokerPortfolio.totalUsd > 0

  // Mode filter: paper and live pipelines run in parallel; every widget on
  // this page shows only the currently selected mode's records.
  const positions = allPositions.filter(p => modeOfBroker(p.broker) === tradingMode)
  const trades = allTrades.filter(t => modeOfBroker(t.broker) === tradingMode)
  const perf = allPerf.filter(p => (p.live ?? false) === (tradingMode === 'live'))
  const dayStartEquity = tradingMode === 'live' ? dayStartLive : paperDayStart
  const peakEquity = tradingMode === 'live' ? peakLive : paperPeak

  const equity = tradingMode === 'live'
    ? (brokerPortfolio?.totalUsd ?? 0)
    : paperEquity({ cash, positions: allPositions, assets })
  const dailyPnl = equity - dayStartEquity
  const dailyPct = dayStartEquity ? (dailyPnl / dayStartEquity) * 100 : 0
  const totalPct = ((equity - START_CASH) / START_CASH) * 100
  const drawdown = peakEquity ? ((equity - peakEquity) / peakEquity) * 100 : 0
  const closed = trades.filter(t => t.status === 'Closed')
  const wins = closed.filter(t => t.pnl > 0).length
  const winRate = closed.length ? (wins / closed.length) * 100 : 0
  const priceOf = (sym: string) => assets.find(a => a.symbol === sym)?.price ?? 0
  const chart = perf.slice(-240).map(p => ({ t: fmtTime(p.ts), equity: Math.round(p.equity) }))
  const liveCount = Object.values(assetSources).filter(s => s !== 'simulated').length
  // Real spendable stablecoin balance at the broker — the number that matters
  // in live mode (the paper "mirror ledger" figure was meaningless there).
  const STABLES = ['USDT', 'USDC', 'FDUSD', 'BUSD', 'DAI', 'TUSD']
  const stableUsd = liveAcct
    ? brokerPortfolio!.balances.filter(b => STABLES.includes(b.asset)).reduce((a, b) => a + (b.usd ?? 0), 0)
    : 0
  const visiblePositionCount = liveAcct ? brokerPortfolio!.balances.filter(b => b.usd === null || b.usd > 1).length : positions.length

  return (
    <div className="grid" style={{ gap: 16 }}>
      {autoPaused && tradingMode === 'live' && (
        <div className="disclaimer-box row spread wrap">
          <span><PauseCircle size={14} style={{ verticalAlign: -2 }} /> <strong>Live risk pause</strong> (paper keeps running): {pauseReason}</span>
          <button className="btn sm" onClick={resumeTrading}>Acknowledge & resume</button>
        </div>
      )}

      {/* ---------- Hero row ---------- */}
      <div className="hero-grid">
        <div className="card hero-card">
          <div className="row spread wrap">
            <div>
              <div className="stat-label">{liveAcct ? `${brokerPortfolio!.broker.toUpperCase()} account value (real)` : 'Portfolio value'}</div>
              <div className="hero-value">{fmtUsd(liveAcct ? brokerPortfolio!.totalUsd : equity, 0)}</div>
              <div className="row wrap" style={{ marginTop: 8 }}>
                {liveAcct ? <>
                  <Badge tone="green">LIVE · synced {Math.max(0, Math.round((Date.now() - brokerPortfolio!.syncedAt) / 1000))}s ago</Badge>
                  {brokerPortfolio!.balances.slice(0, 3).map(b => (
                    <Badge key={b.asset} tone="blue">{b.asset} {b.qty < 1 ? b.qty.toFixed(5) : b.qty.toFixed(2)}{b.usd !== null ? ` ≈ ${fmtUsd(b.usd, 0)}` : ''}</Badge>
                  ))}
                </> : <>
                  <Badge tone={dailyPnl >= 0 ? 'green' : 'red'}>{fmtUsd(dailyPnl)} today ({fmtPct(dailyPct)})</Badge>
                  <Badge tone={totalPct >= 0 ? 'green' : 'red'}>{fmtPct(totalPct)} all-time</Badge>
                </>}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="stat-label">{liveAcct ? 'Available to trade (broker)' : 'Cash available'}</div>
              <div className="stat-value" style={{ fontSize: 18 }}>{fmtUsd(liveAcct ? stableUsd : cash, 0)}</div>
              <div className="stat-sub">{liveCount} live-priced assets{liveAcct ? ' · stablecoin balance, broker is authoritative' : ''}</div>
            </div>
          </div>
          <div style={{ height: 190, marginTop: 14 }}>
            <ResponsiveContainer>
              <AreaChart data={chart} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--blue)" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="var(--blue)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="t" hide />
                <YAxis domain={['auto', 'auto']} width={64} tick={{ fill: 'var(--text-2)', fontSize: 11.5 }} tickFormatter={v => '$' + Number(v).toLocaleString()} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12.5, color: 'var(--text)' }}
                  labelStyle={{ color: 'var(--text-2)' }} itemStyle={{ color: 'var(--text)' }} />
                <Area type="monotone" dataKey="equity" stroke="var(--blue)" fill="url(#eq)" strokeWidth={2.2} dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card hero-side">
          <div className="row spread">
            <h3 style={{ margin: 0 }}><Bot size={13} style={{ verticalAlign: -2 }} /> AI Engine</h3>
            <Badge tone={autoTrading ? 'green' : 'gray'}>{autoTrading ? 'ACTIVE' : 'STANDBY'}</Badge>
          </div>
          <div className="hero-kv">
            <span>Strategy mode</span><strong className="info">{engineMode}</strong>
          </div>
          <div className="hero-kv">
            <span>Market regime</span>
            <Badge tone={regime === 'Trending' ? 'green' : regime === 'Risk-Off' ? 'red' : regime === 'Volatile' ? 'amber' : 'blue'}>{regime}</Badge>
          </div>
          <div className="hero-kv" style={{ display: 'block' }}>
            <div className="row spread" style={{ marginBottom: 6 }}><span>AI confidence</span><strong>{lastConfidence || '—'}</strong></div>
            <Meter value={lastConfidence} color="var(--blue)" />
            {lastConfidence > 0 && (() => {
              const { winRate, n } = realizedWinRateFor(lastConfidence, trades)
              return (
                <div className="small muted" style={{ marginTop: 5 }}>
                  {winRate === null || n < 10
                    ? `Not enough closed trades yet to calibrate this level (${n} so far). Confidence is a signal score, not a win probability.`
                    : `At this confidence, your closed trades have won ${winRate.toFixed(0)}% (n=${n}).`}
                </div>
              )
            })()}
          </div>
          <p className="small" style={{ margin: '10px 0', minHeight: 44 }}>{engineNote}</p>
          <div className="row spread" style={{ borderTop: '1px solid var(--border-2)', paddingTop: 10 }}>
            <span className="small">Cycle speed</span>
            <Segmented options={[1, 10, 60] as const} value={speed} onChange={v => setSpeed(v)} labels={v => `${v}x`} />
          </div>
        </div>
      </div>

      {/* ---------- Metric strip ---------- */}
      <div className="stat-strip">
        {[
          { l: liveAcct ? 'Real holdings' : 'Open positions', v: String(visiblePositionCount), tone: '' },
          { l: 'Win rate', v: closed.length ? `${winRate.toFixed(0)}%` : '—', tone: winRate >= 50 ? 'pos' : 'warn' },
          { l: 'Closed trades', v: `${wins}W / ${closed.length - wins}L`, tone: '' },
          { l: 'Drawdown', v: `${drawdown.toFixed(2)}%`, tone: drawdown < -3 ? 'neg' : '' },
          { l: 'Peak equity', v: fmtUsd(peakEquity, 0), tone: '' }
        ].map(x => (
          <div className="stat-mini" key={x.l}>
            <div className="stat-label">{x.l}</div>
            <div className={`stat-value ${x.tone}`} style={{ fontSize: 16 }}>{x.v}</div>
          </div>
        ))}
      </div>

      {/* ---------- Tables ---------- */}
      <div className="grid g2">
        <div className="card">
          <h3>{liveAcct ? 'Real broker holdings' : 'Open positions'}</h3>
          <div className="tbl-wrap">
            {liveAcct ? (
              <table className="tbl">
                <thead><tr><th>Asset</th><th>Qty</th><th>USD value</th><th>Source</th></tr></thead>
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
                <thead><tr><th>Asset</th><th>Dir</th><th>Qty</th><th>Entry</th><th>Now</th><th>Unrealized</th></tr></thead>
                <tbody>
                  {positions.length === 0 && <tr><td colSpan={6} className="muted">No open positions. {autoTrading ? 'Scanning for qualified setups.' : 'Enable the AI to start.'}</td></tr>}
                  {positions.map(p => {
                    const px = priceOf(p.symbol)
                    const pnl = positionPnl(p, px)
                    return (
                      <tr key={p.tradeId}>
                        <td><strong>{p.symbol}</strong><div className="small">{p.strategy}</div></td>
                        <td><Badge tone={p.direction === 'Long' ? 'green' : 'red'}>{p.direction}</Badge></td>
                        <td className="mono">{p.qty}</td>
                        <td className="mono">{p.entryPrice.toFixed(2)}</td>
                        <td className="mono">{px.toFixed(2)}</td>
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
          <h3>Latest AI activity</h3>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Time</th><th>Asset</th><th>Status</th><th>P&L</th></tr></thead>
              <tbody>
                {trades.slice(0, 7).map(t => (
                  <tr key={t.id}>
                    <td className="small">{fmtTime(t.openedAt)}</td>
                    <td><strong>{t.symbol}</strong><div className="small">{t.strategy}</div></td>
                    <td><Badge tone={statusTone(t.status)}>{t.status}</Badge></td>
                    <td className={`mono ${t.pnl >= 0 ? 'pos' : 'neg'}`}>{t.status === 'Closed' ? fmtUsd(t.pnl) : '—'}</td>
                  </tr>
                ))}
                {trades.length === 0 && <tr><td colSpan={4} className="muted">No trades yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
