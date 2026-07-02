import React, { useState } from 'react'
import { Lock, RefreshCw, ShieldCheck } from 'lucide-react'
import { useStore } from '../store/store'
import { Badge, Modal, fmtTime, statusTone } from '../components/ui'
import { brokers } from '../engine/TradingEngine'
import { LIVE_LOCK_MESSAGE } from '../types'
import type { BrokerId } from '../types'

export default function Brokers() {
  const brokerConn = useStore(s => s.brokerConn)
  const setBrokerConn = useStore(s => s.setBrokerConn)
  const liveRequested = useStore(s => s.liveRequested)
  const liveUnlocked = useStore(s => s.liveUnlocked)
  const adminApprovedLive = useStore(s => s.adminApprovedLive)
  const requestLive = useStore(s => s.requestLive)
  const setLiveUnlocked = useStore(s => s.setLiveUnlocked)
  const profile = useStore(s => s.profile)
  const [busy, setBusy] = useState<BrokerId | null>(null)
  const [confirmLive, setConfirmLive] = useState(false)

  const connect = async (id: BrokerId) => {
    setBusy(id)
    setBrokerConn(id, { status: 'connecting', message: 'Connecting…' })
    const r = await brokers[id].connect()
    setBrokerConn(id, {
      status: brokers[id].status(), message: r.message,
      permissions: r.permissions, healthy: brokers[id].healthy(),
      lastSync: r.ok ? Date.now() : null
    })
    setBusy(null)
  }

  const sync = async (id: BrokerId) => {
    setBusy(id)
    const r = await brokers[id].sync()
    setBrokerConn(id, { message: r.message, lastSync: r.ok ? Date.now() : brokerConn[id].lastSync })
    setBusy(null)
  }

  const card = (id: BrokerId, extra?: React.ReactNode) => {
    const b = brokers[id]
    const c = brokerConn[id]
    return (
      <div className="card" key={id}>
        <div className="row spread wrap">
          <h3 style={{ marginBottom: 4 }}>{b.name}{profile.broker === id && <span className="small"> · your onboarding choice</span>}</h3>
          <Badge tone={statusTone(c.status)}>{c.status}</Badge>
        </div>
        <p className="small mb">{b.description}</p>
        <div className="row wrap mb">
          {b.capabilities.map(cap => <span key={cap} className="badge gray" style={{ fontWeight: 500 }}>{cap}</span>)}
        </div>
        <p className="muted mb" style={{ fontSize: 12 }}>
          <strong>Status:</strong> {c.message}
          {c.permissions.length > 0 && <> · <strong>Permissions:</strong> {c.permissions.join(', ')}</>}
          {c.lastSync && <> · <strong>Last sync:</strong> {fmtTime(c.lastSync)}</>}
          {' '}· <strong>Health:</strong> {c.healthy ? 'healthy' : 'not healthy'}
        </p>
        <div className="row wrap">
          {c.status !== 'connected'
            ? <button className="btn primary sm" disabled={busy === id} onClick={() => connect(id)}>{busy === id ? 'Connecting…' : 'Connect'}</button>
            : <button className="btn sm" disabled={busy === id} onClick={() => sync(id)}><RefreshCw size={13} /> Sync now</button>}
          {extra}
        </div>
      </div>
    )
  }

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="card" style={{ borderColor: 'var(--blue)' }}>
        <h3><ShieldCheck size={13} style={{ verticalAlign: -2 }} /> Non-custodial by design</h3>
        <p className="muted">AutoAlpha AI never accepts deposits and never holds your money. Real funds stay inside your own
          broker account (e.g., Interactive Brokers or eToro). The platform reads account data and transmits authorized
          order instructions through official broker APIs — nothing more. Automated trading involves risk and losses are possible.</p>
      </div>

      {card('paper')}
      {card('ibkr')}
      {card('etoro')}

      <div className="card" style={{ borderColor: liveUnlocked ? 'var(--green)' : 'var(--amber)' }}>
        <div className="row spread wrap">
          <h3><Lock size={13} style={{ verticalAlign: -2 }} /> Live trading — {liveUnlocked ? 'UNLOCKED' : 'LOCKED'}</h3>
          <Badge tone={liveUnlocked ? 'green' : 'amber'}>{liveUnlocked ? 'Authorized' : 'Locked by default'}</Badge>
        </div>
        <p className="muted mb">{LIVE_LOCK_MESSAGE}</p>
        <div className="grid g2" style={{ gap: 8 }}>
          {[
            { label: 'Real broker connected (IBKR or eToro)', ok: brokerConn.ibkr.status === 'connected' || brokerConn.etoro.status === 'connected' },
            { label: 'User authorization requested', ok: liveRequested },
            { label: 'Risk acknowledgement on file', ok: profile.riskAcknowledged },
            { label: 'Compliance review & admin approval', ok: adminApprovedLive }
          ].map((s, i) => (
            <div key={i} className="row" style={{ fontSize: 12.5 }}>
              <span style={{ color: s.ok ? 'var(--green)' : 'var(--text-3)', fontWeight: 700 }}>{s.ok ? '✓' : '○'}</span>
              <span className={s.ok ? '' : 'muted'}>{s.label}</span>
            </div>
          ))}
        </div>
        <div className="row wrap mt">
          {!liveRequested && <button className="btn sm" onClick={requestLive}>Request live trading unlock</button>}
          {liveRequested && !adminApprovedLive && <Badge tone="amber">Pending admin approval (Admin Console)</Badge>}
          {liveRequested && adminApprovedLive && !liveUnlocked &&
            <button className="btn success sm" disabled={brokerConn.ibkr.status !== 'connected' && brokerConn.etoro.status !== 'connected'}
              onClick={() => setConfirmLive(true)}>Enable live trading</button>}
          {liveUnlocked && <button className="btn danger sm" onClick={() => setLiveUnlocked(false)}>Re-lock live trading</button>}
        </div>
        <p className="small mt">Note: this build routes all execution to the paper venue regardless of unlock state, because
          real broker credentials are not configured. A separate confirmation is required before the first live order once
          real API access is wired in.</p>
      </div>

      <Modal open={confirmLive} onClose={() => setConfirmLive(false)}>
        <h2>Enable live trading?</h2>
        <p>You are authorizing AutoAlpha AI to send real order instructions to your connected broker account, within your
          configured risk limits. Real money will be at risk. Automated trading involves risk and losses are possible;
          past performance does not guarantee future results.</p>
        <p>You can pause automation, engage the emergency stop, or re-lock live trading at any time.</p>
        <div className="row spread mt">
          <button className="btn" onClick={() => setConfirmLive(false)}>Cancel</button>
          <button className="btn danger" onClick={() => { setLiveUnlocked(true); setConfirmLive(false) }}>I understand — enable live trading</button>
        </div>
      </Modal>
    </div>
  )
}
