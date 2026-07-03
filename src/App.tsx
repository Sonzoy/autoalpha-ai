import React, { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useStore } from './store/store'
import { brokers, engineTick } from './engine/TradingEngine'
import Layout from './components/Layout'
import Auth from './pages/Auth'
import Landing from './pages/Landing'
import { detectServer, remote, startRemote } from './remote'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import StrategyEngine from './pages/StrategyEngine'
import TradeHistory from './pages/TradeHistory'
import RiskManagement from './pages/RiskManagement'
import MarketIntel from './pages/MarketIntel'
import Portfolio from './pages/Portfolio'
import Brokers from './pages/Brokers'
import Admin from './pages/Admin'
import SetupGuide from './pages/SetupGuide'

const SPEED_MS: Record<number, number> = { 1: 8000, 10: 2500, 60: 800 }

export default function App() {
  const currentUser = useStore(s => s.currentUser)
  const onboarded = useStore(s => s.profile.onboarded)
  const speed = useStore(s => s.speed)
  const theme = useStore(s => s.theme)
  const [showAuth, setShowAuth] = useState(false)
  const [mode, setMode] = useState<'detecting' | 'local' | 'remote'>('detecting')
  const [tokenDraft, setTokenDraft] = useState('')
  const [, forceRender] = useState(0)

  // Detect the 24/7 server daemon: if present, the browser becomes a remote
  // control panel and the local engine stays off.
  useEffect(() => {
    void detectServer().then(isServer => {
      if (isServer) {
        setMode('remote')
        if (remote.token) startRemote(remote.token)
      } else {
        setMode('local')
      }
    })
  }, [])

  // Apply theme to the document root
  useEffect(() => {
    document.documentElement.dataset.theme = theme ?? 'dark'
  }, [theme])

  // Hydrate broker adapters with this user's saved API configuration and
  // reset connections when the account changes (per-user isolation)
  useEffect(() => {
    const st = useStore.getState()
    ;(brokers.ibkr as any).configure(st.brokerConfig?.ibkr ?? null)
    ;(brokers.etoro as any).configure(st.brokerConfig?.etoro ?? null)
    ;(brokers.binance as any).configure(st.brokerConfig?.binance ?? null)
  }, [currentUser])

  // Ensure the paper venue is connected once the user is in the console.
  // Check the ADAPTER state, not persisted state — after a reload the
  // persisted status can say "connected" while the adapter is not.
  useEffect(() => {
    if (mode !== 'local') return
    if (!currentUser || !onboarded) return
    if (brokers.paper.status() === 'disconnected') {
      brokers.paper.connect().then(r => {
        useStore.getState().setBrokerConn('paper', {
          status: 'connected', message: r.message, permissions: r.permissions,
          healthy: true, lastSync: Date.now()
        })
      })
    }
  }, [currentUser, onboarded, mode])

  // Engine heartbeat — runs in a Web Worker so browsers don't throttle it
  // when the tab is in the background. The engine keeps trading as long as
  // this tab stays open (browser or laptop closed = engine stopped; true
  // 24/7 unattended operation requires a server-side deployment).
  useEffect(() => {
    if (mode !== 'local') return // remote mode: the server runs the engine 24/7
    if (!currentUser || !onboarded) return
    const workerCode = 'let id=null;onmessage=e=>{if(id)clearInterval(id);id=setInterval(()=>postMessage(1),e.data)}'
    let worker: Worker | null = null
    try {
      worker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' })))
      worker.onmessage = () => { void engineTick() }
      worker.postMessage(SPEED_MS[speed] ?? 2500)
    } catch {
      // Worker unavailable (rare) — fall back to a normal interval
      const id = setInterval(() => { void engineTick() }, SPEED_MS[speed] ?? 2500)
      return () => clearInterval(id)
    }
    return () => worker?.terminate()
  }, [currentUser, onboarded, speed, mode])

  if (mode === 'detecting') {
    return <div className="auth-wrap"><div className="small">Connecting…</div></div>
  }

  // Remote mode requires the server access token before anything else
  if (mode === 'remote' && (!remote.token || remote.unauthorized)) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="row" style={{ marginBottom: 14 }}>
            <div className="logo-mark">A</div>
            <div className="logo-name" style={{ fontSize: 17 }}>AutoAlpha<span>AI</span></div>
          </div>
          <h1>Server access</h1>
          <p className="sub">This console is connected to a 24/7 AutoAlpha server. Enter the server's access token
            (the AUTH_TOKEN it was started with).{remote.unauthorized && remote.token ? ' The previous token was rejected.' : ''}</p>
          <form onSubmit={e => { e.preventDefault(); if (tokenDraft.trim()) { startRemote(tokenDraft.trim()); forceRender(x => x + 1) } }}>
            <div className="field"><label>Access token</label>
              <input type="password" value={tokenDraft} onChange={e => setTokenDraft(e.target.value)} placeholder="••••••••" autoComplete="off" /></div>
            <button className="btn primary" style={{ width: '100%' }}>Connect</button>
          </form>
        </div>
      </div>
    )
  }

  if (!currentUser) return showAuth || mode === 'remote' ? <Auth /> : <Landing onLaunch={() => setShowAuth(true)} />
  if (!onboarded) return <Onboarding />

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/strategy" element={<StrategyEngine />} />
          <Route path="/history" element={<TradeHistory />} />
          <Route path="/risk" element={<RiskManagement />} />
          <Route path="/intel" element={<MarketIntel />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/brokers" element={<Brokers />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/guide" element={<SetupGuide />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
