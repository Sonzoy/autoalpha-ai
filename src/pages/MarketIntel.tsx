import React, { useState } from 'react'
import { AlertTriangle, Satellite } from 'lucide-react'
import { useStore } from '../store/store'
import { Badge, Meter } from '../components/ui'
import type { PriceSource } from '../types'

const SOURCE_LABEL: Record<PriceSource, { label: string; tone: 'green' | 'blue' | 'gray' }> = {
  binance: { label: 'REALTIME · Binance stream', tone: 'green' },
  coingecko: { label: 'LIVE · CoinGecko', tone: 'green' },
  frankfurter: { label: 'LIVE · ECB', tone: 'green' },
  finnhub: { label: 'LIVE · Finnhub', tone: 'green' },
  broker: { label: 'LIVE · Broker', tone: 'blue' },
  custom: { label: 'LIVE · Custom feed', tone: 'green' },
  simulated: { label: 'SIMULATED', tone: 'gray' }
}

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
  const assetSources = useStore(s => s.assetSources)
  const marketKeys = useStore(s => s.marketKeys)
  const setMarketKey = useStore(s => s.setMarketKey)
  const [finnhubDraft, setFinnhubDraft] = useState(marketKeys.finnhub)
  const liveCount = Object.values(assetSources).filter(s => s !== 'simulated').length
  const customFeeds = useStore(s => s.customFeeds)
  const addCustomFeed = useStore(s => s.addCustomFeed)
  const removeCustomFeed = useStore(s => s.removeCustomFeed)
  const liveDataOnly = useStore(s => s.liveDataOnly)
  const setLiveDataOnly = useStore(s => s.setLiveDataOnly)
  const [showFeedForm, setShowFeedForm] = useState(false)
  const [feed, setFeed] = useState({ name: '', symbol: '', url: '', jsonPath: '', headerName: '', headerValue: '' })

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
              <tr><th>Asset</th><th>Source</th><th>Price</th><th>Trend</th><th>Volatility</th><th>News sent.</th><th>Social sent.</th><th>Liquidity</th><th>Vol. anomaly</th><th>Regime</th></tr>
            </thead>
            <tbody>
              {assets.map(a => {
                const s = intel[a.symbol]
                if (!s) return null
                return (
                  <tr key={a.symbol}>
                    <td><strong>{a.symbol}</strong> <span className="small">{a.market}</span></td>
                    <td>{(() => { const src = SOURCE_LABEL[assetSources[a.symbol] ?? 'simulated']; return <Badge tone={src.tone}>{src.label}</Badge> })()}</td>
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
        <p className="small mt">Assets labeled LIVE use real prices (crypto: CoinGecko · FX: ECB reference rates · stocks/ETFs: Finnhub with your key · broker feed when connected). Assets labeled SIMULATED use the built-in market model. Sentiment and intelligence scores are model-generated in this build.</p>
      </div>

      <div className="card">
        <h3><Satellite size={13} style={{ verticalAlign: -2 }} /> Data providers — {liveCount} of {assets.length} assets live</h3>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Markets</th><th>Provider</th><th>Key required</th><th>Status</th></tr></thead>
            <tbody>
              <tr><td>Crypto (BTC, ETH, SOL)</td><td>CoinGecko</td><td>None</td><td><Badge tone="green">automatic</Badge></td></tr>
              <tr><td>Forex (EUR/USD, USD/JPY)</td><td>Frankfurter · ECB reference rates</td><td>None</td><td><Badge tone="green">automatic</Badge></td></tr>
              <tr><td>Stocks & ETFs</td><td>Finnhub (free tier)</td><td>Your key</td><td>{marketKeys.finnhub ? <Badge tone="green">key saved</Badge> : <Badge tone="amber">key needed</Badge>}</td></tr>
              <tr><td>Commodities</td><td>Simulated (no free browser-accessible feed)</td><td>—</td><td><Badge tone="gray">simulated</Badge></td></tr>
              <tr><td>All markets via broker</td><td>IBKR gateway feed when connected</td><td>Broker connection</td><td><Badge tone="gray">requires gateway</Badge></td></tr>
            </tbody>
          </table>
        </div>
        <div className="mt" style={{ maxWidth: 480 }}>
          <div className="field"><label>Finnhub API key (free at finnhub.io — stored only in this browser, sent only to finnhub.io)</label>
            <input type="password" value={finnhubDraft} onChange={e => setFinnhubDraft(e.target.value)} placeholder="paste your Finnhub key" autoComplete="off" /></div>
          <button className="btn sm" onClick={() => setMarketKey('finnhub', finnhubDraft.trim())}>{marketKeys.finnhub ? 'Update key' : 'Save key'}</button>
          {marketKeys.finnhub && <button className="btn ghost sm" style={{ marginLeft: 8 }} onClick={() => { setFinnhubDraft(''); setMarketKey('finnhub', '') }}>Remove key</button>}
        </div>

        <div className="mt" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div className="row spread wrap">
            <div>
              <strong style={{ fontSize: 13 }}>Live-data-only trading</strong>
              <div className="small">When on (recommended), the engine never opens trades on simulated prices — assets without a live feed are excluded.</div>
            </div>
            <button className={`toggle ${liveDataOnly ? 'on' : ''}`} onClick={() => setLiveDataOnly(!liveDataOnly)}><span className="knob" /></button>
          </div>
        </div>

        <div className="mt" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div className="row spread wrap mb">
            <strong style={{ fontSize: 13 }}>Custom price feeds — connect any platform's API</strong>
            {!showFeedForm && <button className="btn ghost sm" onClick={() => setShowFeedForm(true)}>Add feed</button>}
          </div>
          {customFeeds.length > 0 && (
            <div className="tbl-wrap mb">
              <table className="tbl">
                <thead><tr><th>Name</th><th>Feeds asset</th><th>Endpoint</th><th></th></tr></thead>
                <tbody>
                  {customFeeds.map(f => (
                    <tr key={f.id}>
                      <td>{f.name}</td><td className="mono">{f.symbol}</td>
                      <td className="small">{f.url.length > 40 ? f.url.slice(0, 40) + '…' : f.url}{f.headerName ? ' · auth header set' : ''}</td>
                      <td><button className="btn ghost sm" onClick={() => removeCustomFeed(f.id)}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {showFeedForm && (
            <div style={{ padding: 12, background: 'var(--bg-3)', borderRadius: 8, maxWidth: 560 }}>
              <p className="small mb">Any JSON endpoint works. Example — Binance BTC: URL <span className="mono">https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT</span>, price path <span className="mono">price</span>. API keys go in the auth header (stored only in this browser), never in the URL.</p>
              <div className="grid g2" style={{ gap: 8 }}>
                <div className="field"><label>Feed name</label><input value={feed.name} onChange={e => setFeed({ ...feed, name: e.target.value })} placeholder="Binance BTC" /></div>
                <div className="field"><label>Feeds asset (symbol)</label>
                  <select value={feed.symbol} onChange={e => setFeed({ ...feed, symbol: e.target.value })}>
                    <option value="">Select asset…</option>
                    {assets.map(a => <option key={a.symbol} value={a.symbol}>{a.symbol}</option>)}
                  </select></div>
              </div>
              <div className="field"><label>Endpoint URL (HTTPS, must allow browser/CORS access)</label><input value={feed.url} onChange={e => setFeed({ ...feed, url: e.target.value })} placeholder="https://api.example.com/price?symbol=BTC" /></div>
              <div className="grid g3" style={{ gap: 8 }}>
                <div className="field"><label>Price JSON path</label><input value={feed.jsonPath} onChange={e => setFeed({ ...feed, jsonPath: e.target.value })} placeholder="data.last" /></div>
                <div className="field"><label>Auth header (optional)</label><input value={feed.headerName} onChange={e => setFeed({ ...feed, headerName: e.target.value })} placeholder="X-API-Key" /></div>
                <div className="field"><label>Header value</label><input type="password" value={feed.headerValue} onChange={e => setFeed({ ...feed, headerValue: e.target.value })} autoComplete="off" /></div>
              </div>
              <button className="btn sm primary" disabled={!feed.name || !feed.symbol || !feed.url || !feed.jsonPath}
                onClick={() => { addCustomFeed({ id: `cf-${Date.now()}`, ...feed }); setFeed({ name: '', symbol: '', url: '', jsonPath: '', headerName: '', headerValue: '' }); setShowFeedForm(false) }}>Save feed</button>
              <button className="btn ghost sm" style={{ marginLeft: 8 }} onClick={() => setShowFeedForm(false)}>Cancel</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
