# AutoAlpha AI

Non-custodial AI trading assistant — a fully functional paper-trading prototype with a broker-adapter
architecture ready for real Interactive Brokers / eToro integrations.

**Your money never touches this app.** Funds stay in your own broker account; AutoAlpha only reads account
data and transmits authorized order instructions through official broker APIs. Paper trading is the default
mode. Live trading is locked until broker connection, user authorization, risk acknowledgement, compliance
review, and admin approval are all complete.

## Run it

```bash
npm install
npm run dev        # dev server at http://localhost:5173
npm run build      # production build → dist/
```

Or open `dist/index.html` directly in a browser (the build uses relative paths).

## 24/7 server mode (trades with the browser closed)

The same engine runs headless in Node with file persistence. The web UI, when served
by this daemon, automatically becomes a remote control panel (token-gated) — the
engine keeps trading whether or not any browser is open.

```bash
npm install && npm run build
AUTH_TOKEN=pick-a-strong-secret npm run server     # http://localhost:8787
```

Keep it alive across reboots with pm2:

```bash
npm i -g pm2
AUTH_TOKEN=pick-a-strong-secret pm2 start "npm run server" --name autoalpha
pm2 save && pm2 startup    # follow the printed instruction once
```

- **Env**: `PORT` (default 8787), `DATA_DIR` (default ./server-data), `AUTH_TOKEN` (required in practice — anyone who can reach the port without it controls the engine).
- **One process = one trading workspace.** Each friend runs their own instance: different `PORT` + `DATA_DIR` (and ideally their own machine, since broker credentials live in `DATA_DIR`).
- **Where to run it**: any always-on machine — a spare Mac/PC, Raspberry Pi, or a small VPS. For remote access from your phone, put it behind Tailscale or a reverse proxy with HTTPS; do not expose the raw port to the internet.
- **IBKR note**: server-side calls to your Client Portal Gateway have no browser CORS restrictions, so the gateway integration works best in this mode. The gateway itself must also stay running and logged in ([Certain] IBKR sessions require periodic re-authentication — check the Brokers page health status).
- State persists in `DATA_DIR/storage.json` — back it up if you care about trade history.

## Try the full journey

1. Sign up (any email/password — accounts are stored locally in your browser).
2. Complete onboarding: experience → risk profile → markets → broker → acknowledgements.
3. You land on the trading dashboard. Flip the **AI** toggle in the top bar.
4. Watch trades appear: proposals, risk checks, fills, stops/targets, wins **and** losses.
5. Click any row in **Strategy Engine** to see why the trade was selected and every risk check it passed or failed.
6. Adjust limits in **Risk Management**; try the **emergency stop**; try the admin **kill switch**.
7. Use the speed control (1x / 10x / 60x) to accelerate the simulation.
8. **Brokers** page: connect IBKR/eToro placeholders and walk the live-trading unlock flow (request → admin approval in Admin Console → confirm modal).

## Architecture

```
src/
  engine/
    MarketSimulator.ts        # GBM price paths, regimes, sentiment, macro risk
    TradingEngine.ts          # orchestrator: data → strategy → risk → order → fill → audit
    RiskManager.ts            # 10+ pre-trade checks + portfolio guards (auto-pause)
    AuditLogger.ts            # append-only decision log
    strategies/
      TrendFollowingStrategy.ts
      MeanReversionStrategy.ts
      SentimentMomentumStrategy.ts
      DefensiveRiskOffStrategy.ts
      StrategySelector.ts     # regime detection + routing + allocation sizing
    brokers/
      BrokerAdapter.ts        # the contract (connect/preview/place/cancel/sync/health)
      PaperBrokerAdapter.ts   # full simulated execution: slippage, commissions, rejections
      IBKRBrokerAdapter.ts    # placeholder — wire real Client Portal API here
      EToroBrokerAdapter.ts   # placeholder — requires approved partner API access
  store/store.ts              # zustand + localStorage persistence
  pages/                      # Auth, Onboarding, Dashboard, Strategy, History, Risk, Intel, Portfolio, Brokers, Admin
```

To add a real broker: implement `BrokerAdapter` with real API calls and register it in
`TradingEngine.ts` — nothing else changes.

## Disclaimers

Automated trading involves risk and losses are possible. Past performance does not guarantee future
results. Nothing in this software is financial advice. The simulator intentionally produces losing
trades as well as winning ones; no profit is guaranteed or implied.
