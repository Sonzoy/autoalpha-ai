import React, { useState } from 'react'
import { useStore } from '../store/store'
import type { BrokerId, Market, RiskProfile } from '../types'
import { RISK_DEFAULTS } from '../types'
import { AuditLogger } from '../engine/AuditLogger'

const MARKETS: Market[] = ['Crypto', 'Stocks', 'ETFs', 'Forex', 'Commodities']

export default function Onboarding() {
  const saveProfile = useStore(s => s.saveProfile)
  const updateSettings = useStore(s => s.updateSettings)
  const profile = useStore(s => s.profile)

  const [step, setStep] = useState(0)
  const [experience, setExperience] = useState<'Beginner' | 'Intermediate' | 'Advanced' | ''>('')
  const [risk, setRisk] = useState<RiskProfile>('Balanced')
  const [markets, setMarkets] = useState<Market[]>(['Stocks', 'ETFs'])
  const [broker, setBroker] = useState<BrokerId>('paper')
  const [ackRisk, setAckRisk] = useState(false)
  const [ackAuto, setAckAuto] = useState(false)

  const steps = 5
  const next = () => setStep(s => Math.min(steps - 1, s + 1))
  const back = () => setStep(s => Math.max(0, s - 1))

  const finish = () => {
    saveProfile({
      experience, riskProfile: risk, markets, broker,
      riskAcknowledged: ackRisk, autoTradeConsent: ackAuto, onboarded: true
    })
    updateSettings(RISK_DEFAULTS[risk])
    AuditLogger.info('USER', `Onboarding complete: ${risk} profile, ${markets.join('/')}, broker ${broker}`,
      'Risk acknowledgement and auto-trading consent recorded. Paper trading is the default mode; live trading remains locked.')
  }

  const toggleMarket = (m: Market) =>
    setMarkets(cur => cur.includes(m) ? cur.filter(x => x !== m) : [...cur, m])

  return (
    <div className="auth-wrap">
      <div className="auth-card ob-card">
        <div className="row mb">
          <div className="logo-mark">A</div>
          <div className="logo-name">AutoAlpha<span>AI</span></div>
        </div>
        <div className="ob-steps">{Array.from({ length: steps }, (_, i) => <div key={i} className={i <= step ? 'done' : ''} />)}</div>

        {step === 0 && <>
          <h1>Welcome, {profile.name.split(' ')[0] || 'trader'}. What's your experience level?</h1>
          <p className="sub">This helps calibrate explanations and default safeguards.</p>
          <div className="choice-grid">
            {(['Beginner', 'Intermediate', 'Advanced'] as const).map(x => (
              <button key={x} className={`choice ${experience === x ? 'selected' : ''}`} onClick={() => setExperience(x)}>
                {x}
                <small>{x === 'Beginner' ? 'New to markets or automation' : x === 'Intermediate' ? 'Traded before, new to algos' : 'Comfortable with automated systems'}</small>
              </button>
            ))}
          </div>
          <button className="btn primary" disabled={!experience} onClick={next}>Continue</button>
        </>}

        {step === 1 && <>
          <h1>Choose your risk profile</h1>
          <p className="sub">Sets default allocation, stop-loss, daily loss, and drawdown limits. You can change everything later in Risk Management.</p>
          <div className="choice-grid">
            {(Object.keys(RISK_DEFAULTS) as RiskProfile[]).map(rp => {
              const d = RISK_DEFAULTS[rp]
              return (
                <button key={rp} className={`choice ${risk === rp ? 'selected' : ''}`} onClick={() => setRisk(rp)}>
                  {rp}
                  <small>Max {d.maxAllocationPct}%/trade · SL {d.stopLossPct}% · daily loss {d.dailyLossLimitPct}% · DD pause {d.maxDrawdownPct}%</small>
                </button>
              )
            })}
          </div>
          <div className="row spread"><button className="btn ghost" onClick={back}>Back</button><button className="btn primary" onClick={next}>Continue</button></div>
        </>}

        {step === 2 && <>
          <h1>Which markets should the AI monitor?</h1>
          <p className="sub">Select one or more. The strategy engine only proposes trades in markets you enable.</p>
          <div className="choice-grid">
            {MARKETS.map(m => (
              <button key={m} className={`choice ${markets.includes(m) ? 'selected' : ''}`} onClick={() => toggleMarket(m)}>{m}</button>
            ))}
          </div>
          <div className="row spread"><button className="btn ghost" onClick={back}>Back</button>
            <button className="btn primary" disabled={!markets.length} onClick={next}>Continue</button></div>
        </>}

        {step === 3 && <>
          <h1>Choose your broker</h1>
          <p className="sub">AutoAlpha is non-custodial — we never hold your money. Funds stay in your broker account; we only send authorized order instructions via official APIs.</p>
          <div className="choice-grid" style={{ gridTemplateColumns: '1fr' }}>
            <button className={`choice ${broker === 'paper' ? 'selected' : ''}`} onClick={() => setBroker('paper')}>
              Paper Trading (recommended start)
              <small>$100,000 simulated account. Full engine functionality, zero real risk. Default mode for all new users.</small>
            </button>
            <button className={`choice ${broker === 'ibkr' ? 'selected' : ''}`} onClick={() => setBroker('ibkr')}>
              Interactive Brokers
              <small>Primary live integration target (mature trading APIs). Connects read-only in this build; live routing requires credentials, compliance review, and approval.</small>
            </button>
            <button className={`choice ${broker === 'binance' ? 'selected' : ''}`} onClick={() => {
              setBroker('binance')
              setMarkets(cur => cur.includes('Crypto') ? cur : [...cur, 'Crypto'])
            }}>
              Binance Spot
              <small>Real Binance API connection for funded spot accounts. Long-only crypto trading with signed market orders after live unlock.</small>
            </button>
            <button className={`choice ${broker === 'etoro' ? 'selected' : ''}`} onClick={() => setBroker('etoro')}>
              eToro
              <small>Secondary integration — depends on approved eToro partner API access.</small>
            </button>
          </div>
          <p className="small">Whichever you pick, execution starts in paper mode. Live trading stays locked until all requirements are met.</p>
          <div className="row spread mt"><button className="btn ghost" onClick={back}>Back</button><button className="btn primary" onClick={next}>Continue</button></div>
        </>}

        {step === 4 && <>
          <h1>Acknowledgements</h1>
          <div className="disclaimer-box">
            Automated trading involves risk and losses are possible. Past performance does not guarantee future results.
            AutoAlpha AI optimizes for risk-adjusted returns — it does not and cannot guarantee profits, and individual
            trades will lose money. This platform is not financial advice.
          </div>
          <label className="checkline">
            <input type="checkbox" checked={ackRisk} onChange={e => setAckRisk(e.target.checked)} />
            <span><strong>Risk acknowledgement.</strong> I understand that automated trading involves risk of loss, that no return is guaranteed, and that I am responsible for the risk limits I configure.</span>
          </label>
          <label className="checkline">
            <input type="checkbox" checked={ackAuto} onChange={e => setAckAuto(e.target.checked)} />
            <span><strong>Auto-trading consent.</strong> I authorize AutoAlpha AI to analyze markets and place trades within my configured risk limits through my connected broker account (starting in paper mode). I can pause or stop automation at any time.</span>
          </label>
          <div className="row spread mt">
            <button className="btn ghost" onClick={back}>Back</button>
            <button className="btn success" disabled={!ackRisk || !ackAuto} onClick={finish}>Enter the console</button>
          </div>
        </>}
      </div>
    </div>
  )
}
