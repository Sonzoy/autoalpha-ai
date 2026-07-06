import React, { useState } from 'react'
import { KeyRound, Lock, RefreshCw, ShieldCheck } from 'lucide-react'
import { useStore } from '../store/store'
import { Badge, Modal, fmtTime, statusTone } from '../components/ui'
import { brokers } from '../engine/TradingEngine'
import { LIVE_LOCK_MESSAGE } from '../types'
import type { BrokerId } from '../types'
import { IBKRBrokerAdapter } from '../engine/brokers/IBKRBrokerAdapter'
import { EToroBrokerAdapter } from '../engine/brokers/EToroBrokerAdapter'
import { remote, remoteBrokerConnect, remoteBrokerSync } from '../remote'

export default function Brokers() {
  const brokerConn = useStore(s => s.brokerConn)
  const setBrokerConn = useStore(s => s.setBrokerConn)
  const brokerConfig = useStore(s => s.brokerConfig)
  const setBrokerConfig = useStore(s => s.setBrokerConfig)
  const liveRequested = useStore(s => s.liveRequested)
  const liveUnlocked = useStore(s => s.liveUnlocked)
  const adminApprovedLive = useStore(s => s.adminApprovedLive)
  const executableBrokerConnected = brokerConn.ibkr?.status === 'connected' || brokerConn.binance?.status === 'connected'
  const requestLive = useStore(s => s.requestLive)
  const setLiveUnlocked = useStore(s => s.setLiveUnlocked)
  const profile = useStore(s => s.profile)
  const [busy, setBusy] = useState<BrokerId | null>(null)
  const [confirmLive, setConfirmLive] = useState(false)
  const [editIbkr, setEditIbkr] = useState(false)
  const [editEtoro, setEditEtoro] = useState(false)
  const firstLiveOrderAuthorized = useStore(s => s.firstLiveOrderAuthorized)
  const setFirstLiveOrderAuthorized = useStore(s => s.setFirstLiveOrderAuthorized)

  const mask = (v: string, keep = 4) => v.length <= keep ? '••••' : '••••••••' + v.slice(-keep)

  // IBKR config form state
  const [gatewayUrl, setGatewayUrl] = useState(brokerConfig.ibkr?.gatewayUrl ?? '')
  const [accountId, setAccountId] = useState(brokerConfig.ibkr?.accountId ?? '')
  // eToro config form state
  const [etUser, setEtUser] = useState(brokerConfig.etoro?.username ?? '')
  const [etKey, setEtKey] = useState(brokerConfig.etoro?.apiKey ?? '')
  // Binance config form state. The SECRET is write-only: it is never loaded
  // into the form from storage, so the saved secret never re-enters the page
  // DOM. A blank secret field on save means "keep the existing saved secret".
  const [bnKey, setBnKey] = useState(brokerConfig.binance?.apiKey ?? '')
  const [bnSecret, setBnSecret] = useState('')
  const [editBinance, setEditBinance] = useState(false)

  const saveBinance = () => {
    const key = bnKey.trim()
    // Blank secret => reuse the previously saved secret (don't wipe it).
    const secret = bnSecret.trim() || brokerConfig.binance?.apiSecret || ''
    const cfg = key && secret ? { apiKey: key, apiSecret: secret } : null
    setBrokerConfig('binance', cfg)
    ;(brokers.binance as any).configure(cfg)
    setBnSecret('') // never retain the secret in component state after saving
    setBrokerConn('binance', { message: cfg ? 'API key saved locally — not yet connected.' : 'Configuration cleared.', status: 'disconnected', healthy: false })
  }

  const saveIbkr = () => {
    const cfg = gatewayUrl.trim() ? { gatewayUrl: gatewayUrl.trim(), accountId: accountId.trim() } : null
    setBrokerConfig('ibkr', cfg)
    ;(brokers.ibkr as IBKRBrokerAdapter).configure(cfg)
    setBrokerConn('ibkr', { message: cfg ? 'Gateway configured — not yet connected.' : 'Configuration cleared.', status: 'disconnected', healthy: false })
  }
  const saveEtoro = () => {
    const cfg = etKey.trim() && etUser.trim() ? { username: etUser.trim(), apiKey: etKey.trim() } : null
    setBrokerConfig('etoro', cfg)
    ;(brokers.etoro as EToroBrokerAdapter).configure(cfg)
    setBrokerConn('etoro', { message: cfg ? 'API key saved locally — not yet connected.' : 'Configuration cleared.', status: 'disconnected', healthy: false })
  }

  const connect = async (id: BrokerId) => {
    setBusy(id)
    if (remote.active) {
      // 24/7 server runs the adapters — connect happens server-side (no browser CORS limits)
      await remoteBrokerConnect(id)
    } else {
      setBrokerConn(id, { status: 'connecting', message: 'Connecting…' })
      const r = await brokers[id].connect()
      setBrokerConn(id, {
        status: brokers[id].status(), message: r.message,
        permissions: r.permissions, healthy: brokers[id].healthy(),
        lastSync: r.ok ? Date.now() : null
      })
    }
    setBusy(null)
  }

  const sync = async (id: BrokerId) => {
    setBusy(id)
    if (remote.active) {
      await remoteBrokerSync(id)
    } else {
      const r = await brokers[id].sync()
      setBrokerConn(id, { message: r.message, lastSync: r.ok ? Date.now() : brokerConn[id].lastSync, healthy: brokers[id].healthy(), status: brokers[id].status() })
    }
    setBusy(null)
  }

  const card = (id: BrokerId, configForm?: React.ReactNode) => {
    const b = brokers[id]
    // Defensive default: never crash on a workspace saved before this broker existed
    const c = brokerConn[id] ?? { status: 'disconnected' as const, message: 'Not connected', lastSync: null, permissions: [], healthy: false }
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
        {configForm}
        <p className="muted mb" style={{ fontSize: 12 }}>
          <strong>Status:</strong> {c.message}
          {c.permissions.length > 0 && <> · <strong>Permissions:</strong> {c.permissions.join(', ')}</>}
          {c.lastSync && <> · <strong>Last sync:</strong> {fmtTime(c.lastSync)}</>}
          {' '}· <strong>Health:</strong> {c.healthy ? 'healthy' : 'not healthy'}
        </p>
        <div className="row wrap">
          {c.status !== 'connected'
            ? <button className="btn primary sm" disabled={busy === id} onClick={() => connect(id)}>{busy === id ? 'Connecting…' : 'Connect'}</button>
            : <>
              <button className="btn sm" disabled={busy === id} onClick={() => sync(id)}><RefreshCw size={13} /> Sync now</button>
              <button className="btn ghost sm" onClick={() => { brokers[id].disconnect(); setBrokerConn(id, { status: 'disconnected', message: 'Disconnected by user.', healthy: false }) }}>Disconnect</button>
            </>}
        </div>
      </div>
    )
  }

  // API configuration is hidden by default — a masked summary with an Edit
  // button is shown instead, so credentials are never displayed on screen.
  const ibkrForm = (
    <div className="mb" style={{ padding: 12, background: 'var(--bg-3)', borderRadius: 8 }}>
      <div className="row spread wrap" style={{ marginBottom: editIbkr ? 8 : 0 }}>
        <span className="row"><KeyRound size={13} color="var(--blue)" /><strong style={{ fontSize: 12.5 }}>API setup — Client Portal Gateway</strong>
          {!editIbkr && <span className="small" style={{ marginLeft: 8 }}>
            {brokerConfig.ibkr ? `configured (${mask(brokerConfig.ibkr.gatewayUrl, 0)}${brokerConfig.ibkr.accountId ? ` · acct ${mask(brokerConfig.ibkr.accountId)}` : ''})` : 'not configured'}
          </span>}
        </span>
        {!editIbkr && <button className="btn ghost sm" onClick={() => setEditIbkr(true)}>Edit</button>}
      </div>
      {editIbkr && <>
        <p className="small mb">Run IBKR's Client Portal Gateway on your machine, log in to it with your IBKR credentials (they never touch this app), then save its URL here. Stored only in this browser.</p>
        <div className="field"><label>Gateway URL</label>
          <input value={gatewayUrl} onChange={e => setGatewayUrl(e.target.value)} placeholder="https://localhost:5000/v1/api" /></div>
        <div className="field"><label>Account ID (required for live orders)</label>
          <input value={accountId} onChange={e => setAccountId(e.target.value)} placeholder="U1234567" /></div>
        <button className="btn sm" onClick={() => { saveIbkr(); setEditIbkr(false) }}>{brokerConfig.ibkr ? 'Update' : 'Save'}</button>
        <button className="btn ghost sm" style={{ marginLeft: 8 }} onClick={() => setEditIbkr(false)}>Cancel</button>
        {brokerConfig.ibkr && <button className="btn ghost sm" style={{ marginLeft: 8 }} onClick={() => { setGatewayUrl(''); setAccountId(''); setBrokerConfig('ibkr', null); (brokers.ibkr as IBKRBrokerAdapter).configure(null); setEditIbkr(false) }}>Clear config</button>}
      </>}
    </div>
  )

  const etoroForm = (
    <div className="mb" style={{ padding: 12, background: 'var(--bg-3)', borderRadius: 8 }}>
      <div className="row spread wrap" style={{ marginBottom: editEtoro ? 8 : 0 }}>
        <span className="row"><KeyRound size={13} color="var(--blue)" /><strong style={{ fontSize: 12.5 }}>API setup — eToro API key</strong>
          {!editEtoro && <span className="small" style={{ marginLeft: 8 }}>
            {brokerConfig.etoro ? `configured (${brokerConfig.etoro.username} · key ${mask(brokerConfig.etoro.apiKey)})` : 'not configured'}
          </span>}
        </span>
        {!editEtoro && <button className="btn ghost sm" onClick={() => setEditEtoro(true)}>Edit</button>}
      </div>
      {editEtoro && <>
        <p className="small mb">eToro grants API access on approval — request a key from eToro's developer portal. The key is stored only in this browser and sent only to api.etoro.com in a request header.</p>
        <div className="field"><label>eToro username</label>
          <input value={etUser} onChange={e => setEtUser(e.target.value)} placeholder="your-etoro-username" /></div>
        <div className="field"><label>API key</label>
          <input type="password" value={etKey} onChange={e => setEtKey(e.target.value)} placeholder="••••••••••••••••" autoComplete="off" /></div>
        <button className="btn sm" onClick={() => { saveEtoro(); setEditEtoro(false) }}>{brokerConfig.etoro ? 'Update' : 'Save'}</button>
        <button className="btn ghost sm" style={{ marginLeft: 8 }} onClick={() => setEditEtoro(false)}>Cancel</button>
        {brokerConfig.etoro && <button className="btn ghost sm" style={{ marginLeft: 8 }} onClick={() => { setEtUser(''); setEtKey(''); setBrokerConfig('etoro', null); (brokers.etoro as EToroBrokerAdapter).configure(null); setEditEtoro(false) }}>Clear config</button>}
      </>}
    </div>
  )

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="card" style={{ borderColor: 'var(--blue)' }}>
        <h3><ShieldCheck size={13} style={{ verticalAlign: -2 }} /> Non-custodial by design — credential security</h3>
        <p className="muted">AutoAlpha AI never accepts deposits and never holds your money. Broker credentials are handled to the
          same standard: your IBKR login stays inside IBKR's own gateway (this app only talks to the gateway you run);
          your Binance key signs official REST API requests; your eToro API key is transmitted only to eToro over HTTPS.
          Use the 24/7 server for real Binance trading so API secrets stay out of a browser page and broker calls run server-side.</p>
      </div>

      {card('paper')}
      {card('ibkr', ibkrForm)}
      {card('binance', (
        <div className="mb" style={{ padding: 12, background: 'var(--bg-3)', borderRadius: 8 }}>
          <div className="row spread wrap" style={{ marginBottom: editBinance ? 8 : 0 }}>
            <span className="row"><KeyRound size={13} color="var(--blue)" /><strong style={{ fontSize: 12.5 }}>API setup — Binance key + secret</strong>
              {!editBinance && <span className="small" style={{ marginLeft: 8 }}>
                {brokerConfig.binance ? `configured (key ${mask(brokerConfig.binance.apiKey)})` : 'not configured'}
              </span>}
            </span>
            {!editBinance && <button className="btn ghost sm" onClick={() => setEditBinance(true)}>Edit</button>}
          </div>
          {editBinance && <>
            <p className="small mb">Create the key in Binance → API Management. Enable <strong>only Read + Spot Trading</strong>,
              <strong> disable withdrawals</strong>, and IP-restrict it to your server. Spot is long-only — short signals are skipped.
              Use this with the 24/7 server (browsers may be blocked by CORS, and secrets don't belong in a web page).</p>
            <div className="field"><label>API key</label>
              <input type="password" value={bnKey} onChange={e => setBnKey(e.target.value)} autoComplete="off" placeholder="••••••••••••" /></div>
            <div className="field"><label>API secret {brokerConfig.binance ? <span className="small muted">(saved — leave blank to keep it)</span> : null}</label>
              <input type="password" value={bnSecret} onChange={e => setBnSecret(e.target.value)} autoComplete="off" placeholder={brokerConfig.binance ? 'unchanged — type only to replace' : '••••••••••••'} /></div>
            <button className="btn sm" onClick={() => { saveBinance(); setEditBinance(false) }}>{brokerConfig.binance ? 'Update' : 'Save'}</button>
            <button className="btn ghost sm" style={{ marginLeft: 8 }} onClick={() => { setBnSecret(''); setEditBinance(false) }}>Cancel</button>
            {brokerConfig.binance && <button className="btn ghost sm" style={{ marginLeft: 8 }} onClick={() => { setBnKey(''); setBnSecret(''); setBrokerConfig('binance', null); (brokers.binance as any).configure(null); setEditBinance(false) }}>Clear config</button>}
          </>}
        </div>
      ))}
      {card('etoro', etoroForm)}

      <div className="card" style={{ borderColor: liveUnlocked ? 'var(--green)' : 'var(--amber)' }}>
        <div className="row spread wrap">
          <h3><Lock size={13} style={{ verticalAlign: -2 }} /> Live trading — {liveUnlocked ? 'UNLOCKED' : 'LOCKED'}</h3>
          <Badge tone={liveUnlocked ? 'green' : 'amber'}>{liveUnlocked ? 'Authorized' : 'Locked by default'}</Badge>
        </div>
        <p className="muted mb">{LIVE_LOCK_MESSAGE}</p>
        <div className="grid g2" style={{ gap: 8 }}>
          {[
            { label: 'Live-order broker connected (Binance or IBKR)', ok: executableBrokerConnected },
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
            <button className="btn success sm" disabled={!executableBrokerConnected}
              onClick={() => setConfirmLive(true)}>Enable live trading</button>}
          {liveUnlocked && <button className="btn danger sm" onClick={() => { setLiveUnlocked(false); setFirstLiveOrderAuthorized(false) }}>Re-lock live trading</button>}
        </div>
        {liveUnlocked && (
          <label className="checkline mt">
            <input type="checkbox" checked={firstLiveOrderAuthorized} onChange={e => setFirstLiveOrderAuthorized(e.target.checked)} />
            <span><strong>First live order pre-authorization.</strong> I authorize the engine to transmit real orders to my
              connected Binance or IBKR account within my risk limits. Without this, live-mode orders are held and logged instead of sent.
              Real money is at risk; start with minimal size and consider IBKR's paper account (same API) first.</span>
          </label>
        )}
        <p className="small mt">Binance order routing uses signed official spot API requests and submits real market orders
          to your funded account. IBKR routing goes to your own gateway. The in-app ledger mirrors fills; your broker's
          records are authoritative.</p>
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
