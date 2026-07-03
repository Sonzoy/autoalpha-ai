import React, { useEffect, useRef, useState } from 'react'
import {
  ArrowRight, Bot, BrainCircuit, ChartCandlestick, Landmark, Lock,
  Radar, ShieldCheck, Timer, Wallet, Zap, CircleCheck, CircleX, Gauge, Eye
} from 'lucide-react'
import { DISCLAIMER_SHORT } from '../types'
import { startStream, wsQuotes } from '../engine/LiveStream'

/* ---------- animated counter ---------- */
function Counter({ to, suffix = '', decimals = 0 }: { to: number; suffix?: string; decimals?: number }) {
  const [v, setV] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    const obs = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return
      obs.disconnect()
      const t0 = performance.now()
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / 1400)
        setV(to * (1 - Math.pow(1 - k, 3)))
        if (k < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }, { threshold: 0.4 })
    if (ref.current) obs.observe(ref.current)
    return () => { obs.disconnect(); cancelAnimationFrame(raf) }
  }, [to])
  return <span ref={ref}>{v.toFixed(decimals)}{suffix}</span>
}

/* ---------- live ticker fed by the real Binance stream ---------- */
function LiveTicker() {
  const [, tick] = useState(0)
  useEffect(() => {
    startStream()
    const id = setInterval(() => tick(x => x + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const items = [
    ['BTC/USD', wsQuotes['BTC/USD']], ['ETH/USD', wsQuotes['ETH/USD']], ['SOL/USD', wsQuotes['SOL/USD']]
  ] as const
  const cells = items.map(([sym, q]) => (
    <span className="l-tick" key={sym}>
      <span className="l-tick-sym">{sym}</span>
      <span className="l-tick-px">{q ? `$${q.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : 'connecting…'}</span>
      {q && <span className="badge green" style={{ fontSize: 9.5 }}><span className="dot" />REALTIME</span>}
    </span>
  ))
  return (
    <div className="l-ticker" title="Live prices streamed from Binance's public feed — the same feed the engine trades on">
      <span className="l-tick-label">LIVE MARKET FEED</span>
      {cells}
      <span className="small" style={{ whiteSpace: 'nowrap' }}>+ FX (ECB) · stocks via your data key</span>
    </div>
  )
}

/* ---------- tabbed product showcase ---------- */
function Showcase() {
  const [tab, setTab] = useState(0)
  const tabs = ['Trading Dashboard', 'Risk Engine', 'Audit Trail']
  return (
    <div className="l-showcase card">
      <div className="seg mb">
        {tabs.map((t, i) => <button key={t} className={i === tab ? 'active' : ''} onClick={() => setTab(i)}>{t}</button>)}
      </div>
      {tab === 0 && (
        <div className="grid g4" style={{ gap: 10 }}>
          <div><div className="stat-label">Portfolio value</div><div className="stat-value" style={{ fontSize: 18 }}>$100,000</div></div>
          <div><div className="stat-label">Strategy mode</div><div className="stat-value info" style={{ fontSize: 14, paddingTop: 5 }}>Trend Momentum</div></div>
          <div><div className="stat-label">Market regime</div><div className="stat-value pos" style={{ fontSize: 14, paddingTop: 5 }}>Trending</div></div>
          <div><div className="stat-label">AI confidence</div><div className="stat-value info" style={{ fontSize: 18 }}>74</div></div>
          <div style={{ gridColumn: '1 / -1' }} className="l-spark">
            <svg viewBox="0 0 600 70" preserveAspectRatio="none">
              <path d="M0,50 L30,48 L60,52 L90,44 L120,47 L150,38 L180,41 L210,33 L240,37 L270,28 L300,32 L330,24 L360,29 L390,20 L420,25 L450,16 L480,21 L510,13 L540,17 L570,10 L600,14"
                fill="none" stroke="var(--blue)" strokeWidth="2.5" />
            </svg>
          </div>
        </div>
      )}
      {tab === 1 && (
        <div>
          {[
            ['Max allocation per trade', 'Proposed 5% vs limit 5%', true],
            ['Daily loss limit', 'Day P&L -0.4% vs limit -4%', true],
            ['Correlated exposure', 'Crypto exposure 12% vs 20% cap', true],
            ['Live trading authorization', 'Locked — unlock chain incomplete', false]
          ].map(([name, detail, ok]) => (
            <div className="row" key={String(name)} style={{ padding: '7px 0', borderBottom: '1px solid var(--border-2)', fontSize: 12.5 }}>
              {ok ? <CircleCheck size={15} color="var(--green)" /> : <CircleX size={15} color="var(--red)" />}
              <strong>{name}.</strong> <span className="muted">{detail}</span>
            </div>
          ))}
          <p className="small mt">Twelve checks run before any order exists. Failures block the trade and log the reason.</p>
        </div>
      )}
      {tab === 2 && (
        <div>
          {[
            ['STRATEGY', 'Proposal: Long ETH/USD via Sentiment Driven (confidence 71)'],
            ['RISK', 'Trade approved: all 12 risk checks passed'],
            ['ORDER', 'Fill confirmed: Long 1.62 ETH/USD @ 2,291.40'],
            ['ORDER', 'Position closed: Take profit hit — P&L +$148.22 after commission']
          ].map(([cat, msg], i) => (
            <div className="row" key={i} style={{ padding: '7px 0', borderBottom: '1px solid var(--border-2)', fontSize: 12.5 }}>
              <span className="badge blue">{cat}</span><span className="muted">{msg}</span>
            </div>
          ))}
          <p className="small mt">Every automated decision is recorded with its full reasoning. Nothing happens silently.</p>
        </div>
      )}
      <p className="small mt">Interface preview with sample data.</p>
    </div>
  )
}

export default function Landing({ onLaunch }: { onLaunch: () => void }) {
  return (
    <div className="landing">
      <nav className="l-nav">
        <div className="row">
          <div className="logo-mark">A</div>
          <div className="logo-name" style={{ fontSize: 16 }}>AutoAlpha<span>AI</span></div>
        </div>
        <div className="row l-nav-links">
          <a href="#how">How it works</a>
          <a href="#product">Product</a>
          <a href="#strategies">Strategies</a>
          <a href="#security">Security</a>
          <a href="#faq">FAQ</a>
        </div>
        <button className="btn primary" onClick={onLaunch}>Sign in <ArrowRight size={14} /></button>
      </nav>

      {/* ---------- Hero ---------- */}
      <header className="l-hero l-hero2">
        <div className="l-hero-text" style={{ textAlign: 'center', maxWidth: 780, margin: '0 auto' }}>
          <div className="badge blue" style={{ marginBottom: 20 }}><span className="dot" />AI engine · realtime data · non-custodial</div>
          <h1>Automated trading with an AI that<br /><span className="l-grad">shows its work on every trade.</span></h1>
          <p style={{ margin: '0 auto 26px' }}>AutoAlpha AI reads realtime markets, detects the regime, picks the strategy built for it,
            enforces your risk limits, and executes through your own broker account. Your money never leaves your broker.
            Every decision is explained and on the record.</p>
          <div className="row wrap" style={{ gap: 12, justifyContent: 'center' }}>
            <button className="btn primary l-cta l-glow" onClick={onLaunch}>Start free with paper trading <ArrowRight size={16} /></button>
            <a className="btn ghost l-cta" href="#product">See the console</a>
          </div>
          <p className="small" style={{ marginTop: 16 }}>$100,000 simulated account · realtime market data · no deposit, ever</p>
        </div>
      </header>

      <LiveTicker />

      {/* ---------- Animated stats ---------- */}
      <section className="l-band">
        <div><div className="l-band-n"><Counter to={5} /></div><div className="l-band-t">strategy engines incl. Cash / Risk-Off</div></div>
        <div><div className="l-band-n"><Counter to={12} suffix="+" /></div><div className="l-band-t">pre-trade risk checks on every order</div></div>
        <div><div className="l-band-n">&lt;<Counter to={1} suffix="s" /></div><div className="l-band-t">realtime crypto tick latency (Binance stream)</div></div>
        <div><div className="l-band-n"><Counter to={0} /></div><div className="l-band-t">deposits held — 100% non-custodial</div></div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="l-section" id="how">
        <h2>From sign-up to automated trading in four steps</h2>
        <p className="l-sub">Paper trading is the default. Live trading stays locked behind broker connection, risk
          acknowledgement, compliance approval, and your explicit authorization.</p>
        <div className="l-grid4">
          {[
            { icon: <Wallet size={22} />, t: '1 · Create your account', d: 'Pick a risk profile — Conservative, Balanced, or Aggressive — and the markets to cover: crypto, stocks, ETFs, forex, commodities.' },
            { icon: <Landmark size={22} />, t: '2 · Connect your broker', d: 'Interactive Brokers via your own gateway, or eToro with your API key. Credentials stay on your device — we never see them.' },
            { icon: <Bot size={22} />, t: '3 · Enable the AI engine', d: 'Realtime prices in, regime detection, strategy scoring, risk-sized positions out. All within limits you set.' },
            { icon: <ChartCandlestick size={22} />, t: '4 · Watch every decision', d: 'Full reasoning and every risk check on every trade. Pause, adjust, or emergency-stop anytime.' }
          ].map(x => (
            <div className="card l-feature" key={x.t}>
              <div className="l-ficon">{x.icon}</div>
              <h3 style={{ textTransform: 'none', fontSize: 14, color: 'var(--text)' }}>{x.t}</h3>
              <p className="small">{x.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Product showcase ---------- */}
      <section className="l-section l-alt" id="product">
        <h2>A brokerage-grade operations console</h2>
        <p className="l-sub">Dense, transparent, and built for oversight — not a slot machine.</p>
        <div style={{ maxWidth: 860, margin: '0 auto' }}><Showcase /></div>
      </section>

      {/* ---------- Strategies ---------- */}
      <section className="l-section" id="strategies">
        <h2>Five engines. One decision framework. Zero black boxes.</h2>
        <p className="l-sub">The AI detects the regime — Trending, Ranging, Volatile, or Risk-Off — routes each asset to the
          strategies built for those conditions, and only acts when conviction clears the threshold. When nothing
          qualifies, holding cash is the trade.</p>
        <div className="l-grid3">
          {[
            { icon: <Zap size={18} />, t: 'Trend Momentum', d: 'Rides established moves when momentum is strong and sentiment agrees.' },
            { icon: <Timer size={18} />, t: 'Mean Reversion', d: 'Fades over-extension in calm, range-bound markets.' },
            { icon: <Radar size={18} />, t: 'Sentiment Driven', d: 'Trades aligned news and social momentum once price confirms.' },
            { icon: <ShieldCheck size={18} />, t: 'Defensive Hedge', d: 'Rotates defensive and trims exposure when macro risk climbs.' },
            { icon: <Lock size={18} />, t: 'Cash / Risk-Off', d: 'Stands aside entirely in extreme conditions. Capital preserved.' },
            { icon: <BrainCircuit size={18} />, t: 'Risk engine on top', d: 'Allocation caps, stops, loss limits, drawdown auto-pause, correlation caps — enforced before any order exists.' }
          ].map(x => (
            <div className="card l-feature" key={x.t}>
              <div className="row" style={{ marginBottom: 6 }}><span className="l-ficon sm">{x.icon}</span><strong style={{ fontSize: 13.5 }}>{x.t}</strong></div>
              <p className="small">{x.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Comparison ---------- */}
      <section className="l-section l-alt">
        <h2>Why automate at all?</h2>
        <div className="tbl-wrap" style={{ maxWidth: 860, margin: '24px auto 0' }}>
          <table className="tbl l-cmp">
            <thead><tr><th></th><th>Manual trading</th><th style={{ color: 'var(--blue)' }}>AutoAlpha AI</th></tr></thead>
            <tbody>
              {[
                ['Market coverage', 'When you\'re watching', 'Every tick, while the console runs'],
                ['Discipline', 'Emotions interfere with plans', 'Rules enforced by code, every time'],
                ['Risk limits', 'Easy to override in the moment', 'Hard limits: engine blocks the trade'],
                ['Reaction speed', 'Minutes, at best', 'Sub-second realtime data, seconds to act'],
                ['Record keeping', 'Memory and screenshots', 'Full audit trail with reasoning'],
                ['Guaranteed profits', 'No', 'No — anyone who promises this is lying']
              ].map(([a, b, c]) => (
                <tr key={String(a)}><td><strong>{a}</strong></td><td className="muted">{b}</td><td>{c}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------- Security ---------- */}
      <section className="l-section" id="security">
        <h2>Built like an operations console, not a casino</h2>
        <div className="l-grid3">
          {[
            { icon: <Wallet size={15} />, t: 'Non-custodial, always', d: 'No deposits, no wallets, no withdrawals. Funds never leave your broker account. We transmit authorized order instructions through official broker APIs — nothing else.' },
            { icon: <Lock size={15} />, t: 'Your keys, your device', d: 'Broker credentials stored only on your device, masked in the UI, sent only to your broker\'s own endpoints. IBKR auth happens inside IBKR\'s gateway.' },
            { icon: <ShieldCheck size={15} />, t: 'Live trading: opt-in, four times over', d: 'Broker connection → unlock request → compliance approval → explicit authorization, plus a separate pre-authorization before the first real order. Emergency stop flattens everything.' },
            { icon: <Eye size={15} />, t: 'Every decision on the record', d: 'The audit trail explains every proposal, every risk check result, every broker response. Nothing happens silently.' },
            { icon: <Gauge size={15} />, t: 'Realtime data or no trade', d: 'By default the engine only trades assets with live feeds — sub-second crypto streaming, ECB FX, your equity data key. Simulated prices are labeled and excluded.' },
            { icon: <BrainCircuit size={15} />, t: 'Risk limits you control', d: 'Per-trade caps, stop-loss, take-profit, trailing stops, daily loss limits, drawdown auto-pause — enforced by code, adjustable anytime.' }
          ].map(x => (
            <div className="card l-feature" key={x.t}>
              <div className="row" style={{ marginBottom: 6 }}><span className="l-ficon sm">{x.icon}</span><strong style={{ fontSize: 13.5 }}>{x.t}</strong></div>
              <p className="small">{x.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section className="l-section l-alt" id="faq">
        <h2>Frequently asked questions</h2>
        <div className="l-faq">
          {[
            ['Do I deposit money into AutoAlpha AI?', 'Never. AutoAlpha is non-custodial: your money stays in your own broker account (e.g., Interactive Brokers or eToro). The platform reads account data and sends authorized order instructions through official broker APIs — it cannot move funds.'],
            ['Is profit guaranteed?', 'No — and you should walk away from anyone who says otherwise. The engine optimizes for risk-adjusted returns with strict capital protection, but losses are possible and individual trades will lose. Past performance does not guarantee future results.'],
            ['How real is the market data?', 'Crypto streams tick-by-tick from Binance\'s public feed (sub-second). FX uses ECB reference rates. Stocks/ETFs go live with your free Finnhub key, and you can plug any platform\'s API in as a custom feed. By default the engine refuses to trade anything without a live feed.'],
            ['What is paper trading?', 'A $100,000 simulated account running the full engine on the same realtime data. It\'s the default for every user and the right place to evaluate the system before real money is involved.'],
            ['How does live trading get enabled?', 'Four gates: a connected broker, your unlock request, compliance review with admin approval, and your explicit confirmation — plus a separate pre-authorization before the first real order. Re-lock or emergency-stop anytime.'],
            ['Can I see why the AI made a trade?', 'Yes — every trade records the strategy, regime, confidence score, plain-language rationale, and the result of every individual risk check. The full decision path is documented in-app.']
          ].map(([q, a]) => (
            <details key={q} className="card l-qa"><summary>{q}</summary><p className="small mt">{a}</p></details>
          ))}
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="l-section l-cta-final">
        <h2>See exactly what an AI trading desk does — with zero at stake</h2>
        <p className="l-sub">Full engine, realtime market data, complete transparency. Paper first, always.</p>
        <button className="btn primary l-cta l-glow" onClick={onLaunch}>Launch the console <ArrowRight size={16} /></button>
      </section>

      <footer className="l-footer">
        <div className="row spread wrap" style={{ marginBottom: 12 }}>
          <div className="row"><div className="logo-mark">A</div><div className="logo-name">AutoAlpha<span>AI</span></div></div>
          <div className="row l-nav-links wrap">
            <a href="#how">How it works</a><a href="#product">Product</a><a href="#strategies">Strategies</a><a href="#security">Security</a><a href="#faq">FAQ</a>
          </div>
        </div>
        <p className="small"><strong>Risk disclosure:</strong> {DISCLAIMER_SHORT} Trading financial instruments carries a risk
          of loss that may exceed your initial investment in some products. AutoAlpha AI is a software tool, not a broker,
          custodian, or investment adviser; nothing on this site is investment, legal, or tax advice. Automated strategies are
          rules-based heuristics and have not been validated by regulatory review. Interactive Brokers, eToro, and Binance are
          trademarks of their respective owners; AutoAlpha AI is an independent product with no affiliation or endorsement.</p>
      </footer>
    </div>
  )
}
