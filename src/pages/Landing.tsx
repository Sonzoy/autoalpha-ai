import React from 'react'
import {
  ArrowRight, Bot, BrainCircuit, ChartCandlestick, Landmark, Lock,
  Radar, ShieldCheck, Timer, Wallet, Zap, CircleCheck
} from 'lucide-react'
import { DISCLAIMER_SHORT } from '../types'

export default function Landing({ onLaunch }: { onLaunch: () => void }) {
  return (
    <div className="landing">
      {/* ---------- Nav ---------- */}
      <nav className="l-nav">
        <div className="row">
          <div className="logo-mark">A</div>
          <div className="logo-name" style={{ fontSize: 16 }}>AutoAlpha<span>AI</span></div>
        </div>
        <div className="row l-nav-links">
          <a href="#how">How it works</a>
          <a href="#strategies">Strategies</a>
          <a href="#security">Security</a>
          <a href="#faq">FAQ</a>
        </div>
        <button className="btn primary" onClick={onLaunch}>Sign in <ArrowRight size={14} /></button>
      </nav>

      {/* ---------- Hero ---------- */}
      <header className="l-hero">
        <div className="l-hero-text">
          <div className="badge blue" style={{ marginBottom: 18 }}><span className="dot" />AI trading engine · non-custodial · paper-first</div>
          <h1>Your AI trading desk.<br />Your broker. <span className="l-grad">Your money stays yours.</span></h1>
          <p>AutoAlpha AI analyzes live markets around the clock, selects a strategy suited to the current
            regime, applies strict risk controls, and executes through your own broker account.
            We never touch your funds — we only send the orders you've authorized.</p>
          <div className="row wrap" style={{ gap: 12 }}>
            <button className="btn primary l-cta" onClick={onLaunch}>Start with paper trading <ArrowRight size={16} /></button>
            <a className="btn ghost l-cta" href="#how">See how it works</a>
          </div>
          <p className="small" style={{ marginTop: 14 }}>Free paper account with $100,000 simulated capital · no deposit — ever · live market data included</p>
        </div>
        <div className="l-hero-panel">
          <div className="card" style={{ boxShadow: '0 30px 80px #00000066' }}>
            <div className="row spread mb">
              <span className="badge blue"><span className="dot" />PAPER TRADING</span>
              <span className="badge green"><span className="dot" />AI ACTIVE</span>
            </div>
            <div className="grid g2" style={{ gap: 10 }}>
              <div><div className="stat-label">Portfolio value</div><div className="stat-value" style={{ fontSize: 19 }}>$100,000</div></div>
              <div><div className="stat-label">Strategy mode</div><div className="stat-value info" style={{ fontSize: 15, paddingTop: 4 }}>Trend Momentum</div></div>
              <div><div className="stat-label">Open positions</div><div className="stat-value" style={{ fontSize: 19 }}>3</div></div>
              <div><div className="stat-label">Market regime</div><div className="stat-value pos" style={{ fontSize: 15, paddingTop: 4 }}>Trending</div></div>
            </div>
            <div className="l-spark">
              <svg viewBox="0 0 300 60" preserveAspectRatio="none">
                <path d="M0,45 L20,44 L40,46 L60,40 L80,42 L100,35 L120,37 L140,30 L160,33 L180,26 L200,28 L220,20 L240,24 L260,15 L280,18 L300,10"
                  fill="none" stroke="var(--blue)" strokeWidth="2" />
              </svg>
            </div>
          </div>
        </div>
      </header>

      {/* ---------- Stats band ---------- */}
      <section className="l-band">
        {[
          ['5', 'strategy engines incl. Cash / Risk-Off'],
          ['12+', 'pre-trade risk checks on every order'],
          ['30s', 'live market data refresh cadence'],
          ['0', 'deposits held — 100% non-custodial']
        ].map(([n, t]) => (
          <div key={t}><div className="l-band-n">{n}</div><div className="l-band-t">{t}</div></div>
        ))}
      </section>

      {/* ---------- How it works ---------- */}
      <section className="l-section" id="how">
        <h2>From sign-up to automated trading in four steps</h2>
        <p className="l-sub">Paper trading is the default. Live trading stays locked until your broker is connected,
          risk is acknowledged, compliance review is complete, and you explicitly authorize it.</p>
        <div className="l-grid4">
          {[
            { icon: <Wallet size={22} />, t: '1 · Create your account', d: 'Pick a risk profile — Conservative, Balanced, or Aggressive — and the markets you want covered: crypto, stocks, ETFs, forex, commodities.' },
            { icon: <Landmark size={22} />, t: '2 · Connect your broker', d: 'Link Interactive Brokers via your own gateway, or eToro with your API key. Your credentials stay with your broker — we never see them.' },
            { icon: <Bot size={22} />, t: '3 · Enable the AI engine', d: 'The engine reads live prices, detects the market regime, scores strategies, and sizes positions inside your risk limits.' },
            { icon: <ChartCandlestick size={22} />, t: '4 · Watch every decision', d: 'Each trade shows its full reasoning and every risk check it passed. Pause, adjust limits, or hit the emergency stop anytime.' }
          ].map(x => (
            <div className="card l-feature" key={x.t}>
              <div className="l-ficon">{x.icon}</div>
              <h3 style={{ textTransform: 'none', fontSize: 14, color: 'var(--text)' }}>{x.t}</h3>
              <p className="small">{x.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Strategies ---------- */}
      <section className="l-section l-alt" id="strategies">
        <h2>Five engines. One decision framework. Zero black boxes.</h2>
        <p className="l-sub">Every cycle, the AI detects the regime — Trending, Ranging, Volatile, or Risk-Off — routes
          each asset to the strategies built for those conditions, and only acts when conviction clears the threshold.
          When nothing qualifies, holding cash is the trade.</p>
        <div className="l-grid3">
          {[
            { icon: <Zap size={18} />, t: 'Trend Momentum', d: 'Rides established moves when momentum is strong and sentiment agrees.' },
            { icon: <Timer size={18} />, t: 'Mean Reversion', d: 'Fades over-extension in calm, range-bound markets.' },
            { icon: <Radar size={18} />, t: 'Sentiment Driven', d: 'Trades aligned news and social momentum once price confirms.' },
            { icon: <ShieldCheck size={18} />, t: 'Defensive Hedge', d: 'Rotates defensive and trims exposure when macro risk climbs.' },
            { icon: <Lock size={18} />, t: 'Cash / Risk-Off', d: 'Stands aside entirely in extreme conditions. Capital preserved.' },
            { icon: <BrainCircuit size={18} />, t: 'Risk engine on top', d: 'Allocation caps, stop-loss, daily loss limits, drawdown auto-pause, correlation caps — enforced before any order exists.' }
          ].map(x => (
            <div className="card l-feature" key={x.t}>
              <div className="row" style={{ marginBottom: 6 }}><span className="l-ficon sm">{x.icon}</span><strong style={{ fontSize: 13.5 }}>{x.t}</strong></div>
              <p className="small">{x.d}</p>
            </div>
          ))}
        </div>
        <p className="small" style={{ textAlign: 'center', marginTop: 18, maxWidth: 640, marginLeft: 'auto', marginRight: 'auto' }}>
          Strategies are rules-based and fully inspectable in-app. They aim to optimize risk-adjusted returns —
          they do not guarantee profits, and individual trades will lose money. That's what stop-losses are for.
        </p>
      </section>

      {/* ---------- Security ---------- */}
      <section className="l-section" id="security">
        <h2>Built like an operations console, not a casino</h2>
        <div className="l-grid3">
          {[
            { t: 'Non-custodial, always', d: 'No deposits, no wallets, no withdrawals. Funds never leave your broker account. We transmit authorized order instructions through official broker APIs — nothing else.' },
            { t: 'Your keys, your browser', d: 'Broker API credentials are stored only on your device, masked in the interface, and sent only to your broker\'s own endpoints. IBKR authentication happens inside IBKR\'s gateway.' },
            { t: 'Live trading is opt-in, four times over', d: 'Broker connection → unlock request → compliance approval → your explicit authorization. Plus a separate pre-authorization before the first real order, and an emergency stop that flattens everything.' },
            { t: 'Every decision on the record', d: 'A full audit trail explains why each trade was proposed, which risk checks it passed or failed, and what the broker returned. Nothing happens silently.' },
            { t: 'Live data or no trade', d: 'By default the engine only trades assets with live market data — real crypto, FX, and equity feeds. Simulated prices are labeled and excluded from trading.' },
            { t: 'Risk limits you control', d: 'Per-trade allocation caps, stop-loss and take-profit, trailing stops, daily loss limits, and drawdown auto-pause — enforced by code, adjustable anytime.' }
          ].map(x => (
            <div className="card l-feature" key={x.t}>
              <div className="row" style={{ marginBottom: 6 }}><CircleCheck size={15} color="var(--green)" /><strong style={{ fontSize: 13.5 }}>{x.t}</strong></div>
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
            ['What is paper trading?', 'A $100,000 simulated account running the full engine on live market data. It\'s the default for every new user and the right place to evaluate the system before any real money is involved.'],
            ['How does live trading get enabled?', 'Four gates: a connected broker, your unlock request, compliance review with admin approval, and your explicit confirmation — plus a separate pre-authorization before the first real order. You can re-lock or emergency-stop at any time.'],
            ['Which brokers are supported?', 'Interactive Brokers (via your own Client Portal Gateway) as the primary integration, and eToro (with an eToro-granted API key). More adapters can be added — the broker layer is modular.'],
            ['Can I see why the AI made a trade?', 'Yes — every trade records the strategy, market regime, confidence score, full plain-language rationale, and the result of every individual risk check. The complete decision path is documented in-app.']
          ].map(([q, a]) => (
            <details key={q} className="card l-qa"><summary>{q}</summary><p className="small mt">{a}</p></details>
          ))}
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="l-section l-cta-final">
        <h2>See exactly what an AI trading desk does — with zero at stake</h2>
        <p className="l-sub">Full engine, live market data, complete transparency. Paper first, always.</p>
        <button className="btn primary l-cta" onClick={onLaunch}>Launch the console <ArrowRight size={16} /></button>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="l-footer">
        <div className="row spread wrap" style={{ marginBottom: 12 }}>
          <div className="row"><div className="logo-mark">A</div><div className="logo-name">AutoAlpha<span>AI</span></div></div>
          <div className="row l-nav-links wrap">
            <a href="#how">How it works</a><a href="#strategies">Strategies</a><a href="#security">Security</a><a href="#faq">FAQ</a>
          </div>
        </div>
        <p className="small"><strong>Risk disclosure:</strong> {DISCLAIMER_SHORT} Trading financial instruments carries a risk
          of loss that may exceed your initial investment in some products. AutoAlpha AI is a software tool, not a broker,
          custodian, or investment adviser; nothing on this site is investment, legal, or tax advice. Automated strategies are
          rules-based heuristics and have not been validated by regulatory review. Interactive Brokers and eToro are trademarks
          of their respective owners; AutoAlpha AI is an independent product with no affiliation or endorsement.</p>
      </footer>
    </div>
  )
}
