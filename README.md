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
