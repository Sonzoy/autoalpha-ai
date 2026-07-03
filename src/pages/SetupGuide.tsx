import React from 'react'
import { BookOpen, Landmark, MonitorCog, Power, ShieldAlert, TerminalSquare } from 'lucide-react'

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
        <h3><BookOpen size={13} style={{ verticalAlign: -2 }} /> Setup guide — from zero to automated paper trading</h3>
        <p className="muted">Follow these parts in order. You'll end with the engine trading against a real IBKR paper
          account (real API, simulated money) around the clock. Each person runs their <strong>own</strong> copy of this
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
        <h3><Landmark size={13} style={{ verticalAlign: -2 }} /> Part 2 · IBKR paper account (~10 min)</h3>
        <p className="muted">1. Open an account at interactivebrokers.com (every account includes a free paper-trading twin).<br />
          2. In IBKR Client Portal: Settings → Account Settings → <strong>Paper Trading Account</strong> → create it and set a paper password.<br />
          3. Note the paper username and the paper account ID (it usually starts with <span className="mono">DU</span>). It comes with ~$1M simulated funds.<br />
          <span className="small">Menu locations can shift as IBKR updates their portal — search "paper trading" in their help if it moved.</span></p>
      </div>

      <div className="card">
        <h3><MonitorCog size={13} style={{ verticalAlign: -2 }} /> Part 3 · Client Portal Gateway (~15 min)</h3>
        <p className="muted">The gateway is IBKR's own bridge — your IBKR login happens inside it, never in this app.</p>
        <p className="muted">1. Install Java (macOS: <span className="mono">brew install openjdk</span>).<br />
          2. Download the <strong>Client Portal API Gateway</strong> from IBKR's API documentation site and unzip it (e.g. to <span className="mono">~/ibkr-gateway</span>).<br />
          3. Start it:</p>
        <Code>{`cd ~/ibkr-gateway && bin/run.sh root/conf.yaml`}</Code>
        <p className="muted">4. Open <span className="mono">https://localhost:5000</span> in a browser, accept the certificate
          warning, and log in with your <strong>paper</strong> credentials until you see "Client login succeeds."<br />
          5. Restart this app's server with the TLS flag (needed because the gateway uses a self-signed certificate;
          acceptable only for localhost → your own gateway):</p>
        <Code>{`NODE_TLS_REJECT_UNAUTHORIZED=0 AUTH_TOKEN=your-secret npm run server`}</Code>
      </div>

      <div className="card">
        <h3><ShieldAlert size={13} style={{ verticalAlign: -2 }} /> Part 4 · Connect and unlock (~10 min)</h3>
        <p className="muted">1. Brokers page → Interactive Brokers → <strong>Edit</strong> → Gateway URL
          <span className="mono"> https://localhost:5000/v1/api</span> and your <span className="mono">DU…</span> account ID → Save → <strong>Connect</strong>.<br />
          2. Request live trading unlock → Admin Console → Approve → back to Brokers → Enable live trading → tick the first-order pre-authorization.<br />
          3. Switch the top bar to <strong>LIVE</strong>. Orders now route to your IBKR <em>paper</em> account — verify the first
          fills in both the audit trail here and IBKR's own portal before trusting anything.<br />
          <span className="small">Run in paper for an extended period and compare results against your expectations before
          considering real funds. Strategies are rules-based heuristics — losses are possible and no profit is guaranteed.</span></p>
      </div>

      <div className="card">
        <h3><Power size={13} style={{ verticalAlign: -2 }} /> Part 5 · Keep it running 24/7</h3>
        <Code>{`sudo npm i -g pm2
NODE_TLS_REJECT_UNAUTHORIZED=0 AUTH_TOKEN=your-secret pm2 start "npm run server" --name autoalpha
pm2 start "$HOME/ibkr-gateway/bin/run.sh" --name ibkr-gateway -- root/conf.yaml
pm2 save && pm2 startup   # then run the one command it prints`}</Code>
        <p className="muted">Stop the machine from sleeping (macOS: System Settings → Battery → prevent automatic sleeping
          when display is off, keep it plugged in — or run <span className="mono">caffeinate -s</span>).</p>
        <p className="small"><strong>Known limits, so nobody is surprised:</strong> the engine only runs while this machine is
          on and awake. IBKR gateway sessions expire roughly daily — when that happens the broker health check flags it,
          the risk engine blocks new orders, and you re-login at <span className="mono">https://localhost:5000</span> to resume.
          Never expose port 8787 to the internet; for phone access use Tailscale. Your access token is the only lock on
          the engine — treat it like a password.</p>
      </div>
    </div>
  )
}
