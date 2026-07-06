import React from 'react'
import { BadgeDollarSign, BookOpen, Landmark, Power, RefreshCw, ShieldAlert, TerminalSquare, Wallet } from 'lucide-react'

function Code({ children }: { children: string }) {
  return <pre style={{
    background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 8,
    padding: '10px 12px', fontSize: 12, fontFamily: 'var(--mono)', overflowX: 'auto',
    whiteSpace: 'pre-wrap', margin: '8px 0'
  }}>{children}</pre>
}

export default function SetupGuide() {
  return (
    <div className="grid" style={{ gap: 14, maxWidth: 880 }}>
      <div className="card" style={{ borderColor: 'var(--blue)' }}>
        <h3><BookOpen size={13} style={{ verticalAlign: -2 }} /> Run AutoAlpha live on your own machine</h3>
        <p className="muted">This is the complete, in-order guide to running the app live locally and keeping it trading
          after a restart. You end with the engine connected to your funded Binance <strong>spot</strong> account through
          signed official API requests. Each person runs their <strong>own</strong> copy with their own access token and
          their own broker credentials — never share one instance or one broker login between people.</p>
      </div>

      {/* ---------------- Part 1 ---------------- */}
      <div className="card">
        <h3><TerminalSquare size={13} style={{ verticalAlign: -2 }} /> Part 1 · Start the local server (~10 min)</h3>
        <p className="muted">Requirements: a Mac/PC that can stay on, Node.js 18+ (nodejs.org), and this project folder.
          Run every command from inside the project folder.</p>
        <Code>{`cd <path-to-your-AutoAlpha-folder>
npm install
npm run build
AUTH_TOKEN=pick-a-strong-secret npm run server`}</Code>
        <p className="muted">You should see <span className="mono">AutoAlpha AI server running → http://localhost:8787</span>.
          Open <span className="mono">http://localhost:8787</span>, enter the same token, create your account, and finish
          onboarding. You now have paper trading with live market data — crypto and FX stream automatically; add a free
          Finnhub key on the Market Intel page for live stock/ETF prices.</p>
        <p className="small"><strong>Rebuild after any code change.</strong> The server serves the built <span className="mono">dist/</span>
          folder, so re-run <span className="mono">npm run build</span> and restart the server whenever the code changes,
          or the browser will show a stale UI.</p>
      </div>

      {/* ---------------- Part 2 ---------------- */}
      <div className="card">
        <h3><Landmark size={13} style={{ verticalAlign: -2 }} /> Part 2 · Create a Binance API key (~10 min)</h3>
        <p className="muted">1. In Binance, open <strong>API Management</strong> and create an API key for this server.<br />
          2. Enable <strong>Read</strong> and <strong>Spot &amp; Margin Trading</strong> only. Keep <strong>withdrawals disabled</strong>.<br />
          3. IP-restrict the key to the machine running AutoAlpha.<br />
          4. Fund the spot wallet with <strong>USDT</strong> (this is what buys are sized from) plus any supported crypto.</p>
        <p className="small">Supported spot pairs in this build: <span className="mono">BTC · ETH · SOL · DOGE · XRP · AVAX · LINK · ADA (vs USDT)</span>.
          The secret is HMAC-signed locally and never transmitted — only the signature and the API key header leave the machine.</p>
      </div>

      {/* ---------------- Part 3 ---------------- */}
      <div className="card">
        <h3><ShieldAlert size={13} style={{ verticalAlign: -2 }} /> Part 3 · Connect and unlock live trading (~10 min)</h3>
        <p className="muted">1. <strong>Brokers</strong> page → Binance → <strong>Edit</strong> → paste API key + secret → Save → <strong>Connect</strong>.
          Confirm it reads your real USDT balance.<br />
          2. Set Binance as your <strong>selected broker</strong> (Brokers / onboarding), then walk the safety chain:
          Request live unlock → <strong>Admin Console</strong> → Approve → back to Brokers → Enable live trading → tick the
          first-order pre-authorization.<br />
          3. Switch the top bar to <strong>LIVE</strong>. Orders now route to your real Binance spot account — verify every
          fill in both the audit trail here and Binance's own order history.</p>
      </div>

      {/* ---------------- Part 4: small-account reality ---------------- */}
      <div className="card" style={{ borderColor: 'var(--amber)' }}>
        <h3 style={{ color: 'var(--amber)' }}><Wallet size={13} style={{ verticalAlign: -2 }} /> Part 4 · Make sure orders can actually fire</h3>
        <p className="muted">Two settings decide whether a live order is large enough to execute. If they are mismatched with
          your balance, the engine correctly refuses to trade and you see it "holding" instead of buying:</p>
        <p className="muted"><strong>Order size = account equity × Max allocation %.</strong> It must clear both your
          <em> Minimum trade size</em> (Risk Management) and Binance's ~5 USDT minimum notional.</p>
        <p className="small"><strong>Worked example.</strong> With about 208 USDT and Max allocation 5%, each order is
          ~10.40 USDT. The minimum trade size ships at <strong>10 USDT</strong>, so orders just clear it — but the margin is
          thin: if your balance dips, orders fall below the floor and trading pauses. The durable fixes, in order of
          preference: <strong>add more USDT</strong>, or <strong>raise Max allocation %</strong> so orders comfortably exceed
          both floors. Lowering the minimum further only invites commission bleed on tiny trades.</p>
        <p className="small"><strong>Long-only.</strong> Binance spot cannot short, so the engine now skips short signals in
          live mode entirely — it goes to cash instead of attempting an unfillable order. That reduces how often it trades;
          it does not increase your risk. Sitting in USDT through a downturn is the spot equivalent of standing aside.</p>
      </div>

      {/* ---------------- Part 5: keep it running ---------------- */}
      <div className="card">
        <h3><RefreshCw size={13} style={{ verticalAlign: -2 }} /> Part 5 · Keep trading operational across restarts</h3>
        <p className="muted">Your whole workspace (account, broker credentials, settings, trade history) persists to
          <span className="mono"> server-data/storage.json</span>. On restart the engine reloads it, auto-reconnects Binance,
          and resumes — with one deliberate safety exception: <strong>AI auto-trading always starts OFF after a fresh login</strong>,
          and the emergency stop / kill switch stay as you left them. The 24/7 server process keeps auto-trading running as
          long as the process itself is alive.</p>
        <p className="muted"><strong>So "operational on restart" means: keep the server process alive.</strong> Use a process
          manager so it relaunches on boot and after crashes.</p>
        <p className="small" style={{ marginBottom: 4 }}><strong>macOS / Linux — pm2:</strong></p>
        <Code>{`sudo npm i -g pm2
cd <path-to-your-AutoAlpha-folder>
AUTH_TOKEN=your-secret pm2 start "npm run server" --name autoalpha
pm2 save
pm2 startup     # then run the one command it prints`}</Code>
        <p className="small">Stop the machine from sleeping (macOS: System Settings → Battery → prevent sleeping when the
          display is off, keep it plugged in — or run <span className="mono">caffeinate -s</span> in a separate terminal).
          After a reboot, confirm at <span className="mono">http://localhost:8787</span> that the server is up, Binance shows
          Connected on the Brokers page, then re-enable the <strong>AI</strong> toggle to resume auto-trading.</p>
        <p className="small"><strong>Restart checklist:</strong> server process up → Binance "Connected" with a fresh balance
          sync → mode shows LIVE → AI toggle ON. If Binance sync fails, the broker health check flags it and the risk engine
          blocks new orders until it recovers. Never expose port 8787 to the internet; for phone access use Tailscale. Your
          access token is the only lock on the engine — treat it like a password.</p>
      </div>

      {/* ---------------- Real-money checklist ---------------- */}
      <div className="card" style={{ borderColor: 'var(--red)' }}>
        <h3 style={{ color: 'var(--red)' }}><BadgeDollarSign size={13} style={{ verticalAlign: -2 }} /> Part 6 · Real-money checklist</h3>
        <p className="muted">1. <strong>Binance account ready.</strong> Spot trading enabled, API key has no withdrawal permission, key is IP-restricted, USDT funded.<br />
          2. <strong>Use small risk first.</strong> Risk Management → Conservative preset, then confirm order size clears the minimums (Part 4).<br />
          3. <strong>Re-arm the safety chain deliberately.</strong> If live was unlocked during testing, hit <em>Re-lock live trading</em> first,
          then walk the full chain again — unlock request → admin approval → enable → first-order pre-authorization — so switching to real money is a conscious choice.<br />
          4. <strong>Supervise the first session.</strong> Watch proposal → risk checks → <span className="mono">LIVE BINANCE FILL</span> in the audit trail → the same fill in Binance.<br />
          5. <strong>Ongoing discipline.</strong> Treat any mismatch between this app and Binance's records as a stop-everything event — Binance is authoritative.</p>
        <p className="small"><strong>Read before risking a cent:</strong> signal prices come from the app's market-data feeds while orders
          execute at Binance's prices — mismatches and slippage are inherent, another reason to size small. The strategies are rules-based
          heuristics without historical backtesting; individual trades lose money by design (that is what stops are for), no profit is
          guaranteed, and past performance does not guarantee future results. Each person must use their own broker account and make their
          own decision to go live. This software is not financial advice.</p>
      </div>

      {/* ---------------- Multi-user note ---------------- */}
      <div className="card">
        <h3><Power size={13} style={{ verticalAlign: -2 }} /> Running more than one account</h3>
        <p className="muted">One process = one trading workspace (one account, one broker setup). To run a second person or a
          second strategy, launch another instance with a different <span className="mono">PORT</span> and
          <span className="mono"> DATA_DIR</span> — ideally on a separate machine, since broker credentials live in the data dir.</p>
        <Code>{`PORT=8788 DATA_DIR=./server-data-2 AUTH_TOKEN=another-secret npm run server`}</Code>
      </div>
    </div>
  )
}
