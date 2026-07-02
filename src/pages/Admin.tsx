import React, { useState } from 'react'
import { OctagonX, ShieldCheck, Users } from 'lucide-react'
import { useStore } from '../store/store'
import { Badge, Modal, Segmented, fmtTime, statusTone } from '../components/ui'
import type { AuditCategory } from '../types'

type LogFilter = 'All' | AuditCategory

export default function Admin() {
  const users = useStore(s => s.users)
  const currentUser = useStore(s => s.currentUser)
  const profile = useStore(s => s.profile)
  const brokerConn = useStore(s => s.brokerConn)
  const trades = useStore(s => s.trades)
  const audit = useStore(s => s.audit)
  const autoTrading = useStore(s => s.autoTrading)
  const killSwitch = useStore(s => s.killSwitch)
  const setKillSwitch = useStore(s => s.setKillSwitch)
  const liveRequested = useStore(s => s.liveRequested)
  const adminApprovedLive = useStore(s => s.adminApprovedLive)
  const setAdminApprovedLive = useStore(s => s.setAdminApprovedLive)
  const resetDemo = useStore(s => s.resetDemo)
  const [filter, setFilter] = useState<LogFilter>('All')
  const [confirmKill, setConfirmKill] = useState(false)

  const failedOrders = trades.filter(t => t.status === 'Rejected')
  const riskBreaches = audit.filter(e => e.category === 'RISK' && e.severity !== 'info')
  const brokerErrors = audit.filter(e => e.category === 'BROKER' && e.severity === 'error')
  const logs = audit.filter(e => filter === 'All' || e.category === filter).slice(0, 100)

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="grid g4">
        <div className="card"><div className="stat-label">Users</div><div className="stat-value">{users.length}</div><div className="stat-sub">Registered accounts</div></div>
        <div className="card"><div className="stat-label">Active bots</div><div className="stat-value">{autoTrading && !killSwitch ? 1 : 0}</div><div className="stat-sub">AI engines running</div></div>
        <div className="card"><div className="stat-label">Failed orders</div><div className={`stat-value ${failedOrders.length ? 'warn' : ''}`}>{failedOrders.length}</div><div className="stat-sub">Rejected by risk or broker</div></div>
        <div className="card"><div className="stat-label">Risk breaches</div><div className={`stat-value ${riskBreaches.length ? 'neg' : ''}`}>{riskBreaches.length}</div><div className="stat-sub">{brokerErrors.length} broker errors</div></div>
      </div>

      <div className="grid g2">
        <div className="card">
          <h3><Users size={13} style={{ verticalAlign: -2 }} /> Users & connected brokers</h3>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>User</th><th>Risk profile</th><th>Broker</th><th>Status</th></tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.email}>
                    <td><strong>{u.name}</strong><div className="small">{u.email}</div></td>
                    <td>{u.email === currentUser ? profile.riskProfile : '—'}</td>
                    <td>{u.email === currentUser ? profile.broker.toUpperCase() : '—'}</td>
                    <td>{u.email === currentUser ? <Badge tone="green">active session</Badge> : <Badge tone="gray">offline</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row wrap mt">
            {(['paper', 'ibkr', 'etoro'] as const).map(id => (
              <span key={id} className="row" style={{ gap: 5 }}>
                <span className="small">{id.toUpperCase()}</span>
                <Badge tone={statusTone(brokerConn[id].status)}>{brokerConn[id].status}</Badge>
              </span>
            ))}
          </div>
        </div>

        <div className="card">
          <h3><ShieldCheck size={13} style={{ verticalAlign: -2 }} /> Live trading approvals</h3>
          {!liveRequested && <p className="muted">No pending live-trading requests.</p>}
          {liveRequested && (
            <div className="row spread wrap" style={{ padding: '8px 0' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{profile.name} ({profile.email})</div>
                <div className="small">Requests live trading unlock · risk profile {profile.riskProfile} · risk ack: {profile.riskAcknowledged ? 'yes' : 'no'} · consent: {profile.autoTradeConsent ? 'yes' : 'no'}</div>
              </div>
              {adminApprovedLive
                ? <button className="btn sm danger" onClick={() => setAdminApprovedLive(false)}>Revoke approval</button>
                : <button className="btn sm success" onClick={() => setAdminApprovedLive(true)}>Approve (compliance reviewed)</button>}
            </div>
          )}

          <div className="mt" style={{ padding: 14, border: '1px solid var(--red)', borderRadius: 10, background: 'var(--red-bg)' }}>
            <div className="row spread wrap">
              <div>
                <div style={{ fontWeight: 700, color: 'var(--red)' }}><OctagonX size={15} style={{ verticalAlign: -2 }} /> Platform kill switch</div>
                <div className="small">Halts every bot platform-wide and flattens open positions. Use for incidents.</div>
              </div>
              <button className={`btn ${killSwitch ? '' : 'danger'}`} onClick={() => killSwitch ? setKillSwitch(false) : setConfirmKill(true)}>
                {killSwitch ? 'Release kill switch' : 'ENGAGE'}
              </button>
            </div>
          </div>
          <button className="btn ghost sm mt" onClick={resetDemo}>Reset demo data (portfolio, trades, logs)</button>
        </div>
      </div>

      <div className="card">
        <div className="row spread wrap mb">
          <h3 style={{ margin: 0 }}>Audit logs — every automated decision, explained</h3>
          <Segmented<LogFilter> options={['All', 'STRATEGY', 'RISK', 'ORDER', 'BROKER', 'ADMIN'] as LogFilter[]} value={filter} onChange={setFilter} />
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Time</th><th>Category</th><th>Severity</th><th>Event</th></tr></thead>
            <tbody>
              {logs.length === 0 && <tr><td colSpan={4} className="muted">No log entries for this filter.</td></tr>}
              {logs.map(e => (
                <tr key={e.id}>
                  <td className="small mono">{fmtTime(e.ts)}</td>
                  <td><Badge tone={e.category === 'RISK' ? 'amber' : e.category === 'ORDER' ? 'blue' : e.category === 'ADMIN' ? 'red' : 'gray'}>{e.category}</Badge></td>
                  <td><Badge tone={e.severity === 'error' ? 'red' : e.severity === 'warn' ? 'amber' : 'green'}>{e.severity}</Badge></td>
                  <td style={{ whiteSpace: 'normal' }}>
                    <div style={{ fontSize: 12.5 }}>{e.message}</div>
                    {e.detail && <div className="small">{e.detail}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={confirmKill} onClose={() => setConfirmKill(false)}>
        <h2>Engage platform kill switch?</h2>
        <p>This immediately halts all automated trading for every user and flattens open positions at market. This action is logged in the audit trail.</p>
        <div className="row spread mt">
          <button className="btn" onClick={() => setConfirmKill(false)}>Cancel</button>
          <button className="btn danger" onClick={() => { setKillSwitch(true); setConfirmKill(false) }}>Engage kill switch</button>
        </div>
      </Modal>
    </div>
  )
}
