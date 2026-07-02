import React from 'react'
import { OctagonX, PauseCircle } from 'lucide-react'
import { useStore } from '../store/store'
import { Toggle } from '../components/ui'
import { RISK_DEFAULTS } from '../types'
import type { RiskProfile } from '../types'

function Num({ label, value, onChange, min, max, step, suffix }: {
  label: string; value: number; onChange: (v: number) => void
  min: number; max: number; step: number; suffix: string
}) {
  return (
    <div className="field">
      <label>{label} <span className="mono" style={{ color: 'var(--blue)' }}>{value}{suffix}</span></label>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))} style={{ accentColor: 'var(--blue)', padding: 0 }} />
    </div>
  )
}

export default function RiskManagement() {
  const settings = useStore(s => s.settings)
  const updateSettings = useStore(s => s.updateSettings)
  const profile = useStore(s => s.profile)
  const saveProfile = useStore(s => s.saveProfile)
  const autoTrading = useStore(s => s.autoTrading)
  const setAutoTrading = useStore(s => s.setAutoTrading)
  const emergencyStop = useStore(s => s.emergencyStop)
  const setEmergencyStop = useStore(s => s.setEmergencyStop)
  const autoPaused = useStore(s => s.autoPaused)
  const pauseReason = useStore(s => s.pauseReason)
  const resumeTrading = useStore(s => s.resumeTrading)

  const applyProfile = (rp: RiskProfile) => {
    saveProfile({ riskProfile: rp })
    updateSettings(RISK_DEFAULTS[rp])
  }

  return (
    <div className="grid g2" style={{ gap: 14, alignItems: 'start' }}>
      <div className="card">
        <h3>Risk profile presets</h3>
        <div className="choice-grid">
          {(Object.keys(RISK_DEFAULTS) as RiskProfile[]).map(rp => {
            const d = RISK_DEFAULTS[rp]
            return (
              <button key={rp} className={`choice ${profile.riskProfile === rp ? 'selected' : ''}`} onClick={() => applyProfile(rp)}>
                {rp}
                <small>{d.maxAllocationPct}%/trade · SL {d.stopLossPct}% · daily {d.dailyLossLimitPct}% · DD {d.maxDrawdownPct}%</small>
              </button>
            )
          })}
        </div>

        <h3 className="mt">Limits</h3>
        <Num label="Max allocation per trade" value={settings.maxAllocationPct} onChange={v => updateSettings({ maxAllocationPct: v })} min={0.5} max={15} step={0.5} suffix="%" />
        <Num label="Stop loss" value={settings.stopLossPct} onChange={v => updateSettings({ stopLossPct: v })} min={0.5} max={8} step={0.5} suffix="%" />
        <Num label="Take profit" value={settings.takeProfitPct} onChange={v => updateSettings({ takeProfitPct: v })} min={1} max={16} step={0.5} suffix="%" />
        <Num label="Max daily loss" value={settings.dailyLossLimitPct} onChange={v => updateSettings({ dailyLossLimitPct: v })} min={1} max={12} step={0.5} suffix="%" />
        <Num label="Max drawdown pause" value={settings.maxDrawdownPct} onChange={v => updateSettings({ maxDrawdownPct: v })} min={2} max={25} step={1} suffix="%" />

        <h3 className="mt">Protections</h3>
        <div className="row spread" style={{ padding: '8px 0' }}>
          <span className="muted">Stop-loss enforcement</span>
          <Toggle on={settings.stopLossEnabled} onChange={v => updateSettings({ stopLossEnabled: v })} />
        </div>
        <div className="row spread" style={{ padding: '8px 0' }}>
          <span className="muted">Take-profit enforcement</span>
          <Toggle on={settings.takeProfitEnabled} onChange={v => updateSettings({ takeProfitEnabled: v })} />
        </div>
        <div className="row spread" style={{ padding: '8px 0' }}>
          <span className="muted">Trailing stop</span>
          <Toggle on={settings.trailingStopEnabled} onChange={v => updateSettings({ trailingStopEnabled: v })} />
        </div>
      </div>

      <div className="grid" style={{ gap: 14 }}>
        <div className="card">
          <h3>Trading controls</h3>
          <div className="row spread" style={{ padding: '8px 0' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>AI auto-trading</div>
              <div className="small">The engine proposes and executes trades within your limits.</div>
            </div>
            <Toggle on={autoTrading} disabled={emergencyStop} onChange={setAutoTrading} />
          </div>

          {autoPaused && (
            <div className="disclaimer-box">
              <div className="row spread wrap">
                <span><PauseCircle size={14} style={{ verticalAlign: -2 }} /> <strong>Auto-paused:</strong> {pauseReason}</span>
                <button className="btn sm" onClick={resumeTrading}>Acknowledge & resume</button>
              </div>
            </div>
          )}

          <div className="mt" style={{ padding: 14, border: '1px solid var(--red)', borderRadius: 10, background: 'var(--red-bg)' }}>
            <div className="row spread wrap">
              <div>
                <div style={{ fontWeight: 700, color: 'var(--red)' }}><OctagonX size={15} style={{ verticalAlign: -2 }} /> Emergency stop</div>
                <div className="small">Immediately halts all automated trading and flattens open positions at market.</div>
              </div>
              <button className={`btn ${emergencyStop ? '' : 'danger'}`} onClick={() => setEmergencyStop(!emergencyStop)}>
                {emergencyStop ? 'Release emergency stop' : 'ENGAGE'}
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <h3>How the risk engine protects you</h3>
          <p className="muted">Every proposed trade passes through ten checks before any order is sent: emergency stop, platform kill switch, auto-pause status, per-trade allocation cap, daily loss limit, max drawdown, stop-loss presence, correlated market exposure (20% cap per market), duplicate positions, position count, broker health, and the live-trading lock. Each approval or rejection is logged with the reason in the audit trail.</p>
          <p className="small mt">Risk controls reduce — but cannot eliminate — the risk of loss. Fast markets, gaps, and slippage can cause fills beyond configured stop levels.</p>
        </div>
      </div>
    </div>
  )
}
