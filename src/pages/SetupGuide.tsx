import React from 'react'
import { BadgeDollarSign, BookOpen, Landmark, Power, ShieldAlert, TerminalSquare } from 'lucide-react'

function Code({ children }: { children: string }) {
  return <pre style={{
    background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 8,
    padding: '10px 12px', fontSize: 12, fontFamily: 'var(--mono)', overflowX: 'auto',
    whiteSpace: 'pre-wrap', margin: '8px 0'
  }}>{children}</pre>
}

export default function SetupGuide() {
  return (
    <div className="grid" style={{ gap: 14, maxWidth: 860 }}>
      <div className="card" style={{ borderColor: 'var(--blue)' }}>
        <h3><BookOpen size={13} style={{ verticalAlign: -2 }} /> Setup guide — Binance live spot trading</h3>
        <p className="muted">Follow these parts in order. You'll end with the engine connected to your funded Binance
          spot account through signed official API requests. Each person runs their <strong>own</strong> copy of this
          app with their own access token and their own broker credentials — never share one instance or one broker
          login between people.</p>
      </div>

      <div className="card">
        <h3><TerminalSquare size={13} style={{ verticalAlign: -2 }} /> Part 1 · Run the app on your machine (~10 min)</h3>
        <p className="muted">Requirements: a Mac/PC that can stay on, Node.js 18+ (nodejs.org), and this project folder.</p>
        <Code>{`cd <path-to-your-AutoAlpha-folder>
npm install && npm run build
AUTH_TOKEN=pick-a-strong-secret npm run server`}</Code>
        <p className="muted">Open <span className="mono">http://localhost:8787</span>, enter the same token, create your
          account, and finish onboarding. You now have paper trading with live market data — crypto streams in realtime
          automatically; add a free Finnhub key on the Market Intel page for live stock/ETF prices.</p>
      </div>

      <div className="card">
        <h3><Landmark size={13} style={{ verticalAlign: -2 }} /> Part 2 · Binance API key (~10 min)</h3>
        <p className="muted">1. In Binance, open API Management and create an API key for this server.<br />
          2. Enable <strong>Read</strong> and <strong>Spot Trading</strong> only. Keep withdrawals disabled.<br />
          3. IP-restrict the key to the machine or server running AutoAlpha.<br />
          4. Fund the spot wallet with the assets you want to trade, usually USDT plus supported crypto pairs.</p>
      </div>

      <div className="card">
        <h3><ShieldAlert size={13} style={{ verticalAlign: -2 }} /> Part 3 · Connect and unlock (~10 min)</h3>
        <p className="muted">1. Brokers page → Binance → <strong>Edit</strong> → paste API key and secret → Save → <strong>Connect</strong>.<br />
          2. Request live trading unlock → Admin Console → Approve → back to Brokers → Enable live trading → tick the first-order pre-authorization.<br />
          3. Switch the top bar to <strong>LIVE</strong>. Orders now route to your real Binance spot account — verify every
          fill in both the audit trail here and Binance's own order history.</p>
      </div>

      <div className="card" style={{ borderColor: 'var(--red)' }}>
        <h3 style={{ color: 'var(--red)' }}><BadgeDollarSign size={13} style={{ verticalAlign: -2 }} /> Part 4 · Real-money checklist</h3>
        <p className="muted">1. <strong>Binance account ready.</strong> Confirm spot trading is enabled, the API key has no withdrawal permission, and the key is IP-restricted.<br />
          2. <strong>Use small risk first.</strong> Risk Management → Conservative preset, then lower max allocation further for the first session.<br />
          3. <strong>Re-arm the safety chain deliberately.</strong> If live trading was unlocked during testing, hit
          <em> Re-lock live trading</em> first, then walk the full chain again — unlock request → admin approval → enable →
          first-order pre-authorization — so switching to real money is a conscious decision, not inherited state.<br />
          4. <strong>Supervise the first session.</strong> Watch proposal → risk checks → LIVE BINANCE FILL in the audit trail → the same fill in Binance.<br />
          5. <strong>Ongoing discipline.</strong> Treat any mismatch between this app and Binance's records as a stop-everything event — Binance is authoritative.</p>
        <p className="small"><strong>Read before risking a cent:</strong> signal prices come from the app's market data feeds
          while orders execute at Binance's prices — mismatches and slippage are inherent,
          which is another reason to size small. The strategies are rules-based heuristics without historical backtesting;
          losses are possible, no profit is guaranteed, and past performance does not guarantee future results. Each person
          must use their own broker account and make their own decision to go live. This software is not financial advice.</p>
      </div>

      <div className="card">
        <h3><Power size={13} style={{ verticalAlign: -2 }} /> Part 5 · Keep it running 24/7</h3>
        <Code>{`sudo npm i -g pm2
AUTH_TOKEN=your-secret pm2 start "npm run server" --name autoalpha
pm2 save && pm2 startup   # then run the one command it prints`}</Code>
        <p className="muted">Stop the machine from sleeping (macOS: System Settings → Battery → prevent automatic sleeping
          when display is off, keep it plugged in — or run <span className="mono">caffeinate -s</span>).</p>
        <p className="small"><strong>Known limits, so nobody is surprised:</strong> the engine only runs while this machine is
          on and awake. If Binance sync fails, the broker health check flags it and the risk engine blocks new orders.
          Never expose port 8787 to the internet; for phone access use Tailscale. Your access token is the only lock on
          the engine — treat it like a password.</p>
      </div>
    </div>
  )
}
