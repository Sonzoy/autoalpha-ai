import React, { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useStore } from './store/store'
import { brokers, engineTick } from './engine/TradingEngine'
import Layout from './components/Layout'
import Auth from './pages/Auth'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import StrategyEngine from './pages/StrategyEngine'
import TradeHistory from './pages/TradeHistory'
import RiskManagement from './pages/RiskManagement'
import MarketIntel from './pages/MarketIntel'
import Portfolio from './pages/Portfolio'
import Brokers from './pages/Brokers'
import Admin from './pages/Admin'

const SPEED_MS: Record<number, number> = { 1: 8000, 10: 2500, 60: 800 }

export default function App() {
  const currentUser = useStore(s => s.currentUser)
  const onboarded = useStore(s => s.profile.onboarded)
  const speed = useStore(s => s.speed)
  const theme = useStore(s => s.theme)

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
  }, [currentUser])

  // Ensure the paper venue is connected once the user is in the console
  useEffect(() => {
    if (!currentUser || !onboarded) return
    const st = useStore.getState()
    if (st.brokerConn.paper.status !== 'connected') {
      brokers.paper.connect().then(r => {
        useStore.getState().setBrokerConn('paper', {
          status: 'connected', message: r.message, permissions: r.permissions,
          healthy: true, lastSync: Date.now()
        })
      })
    }
  }, [currentUser, onboarded])

  // Engine heartbeat — runs in a Web Worker so browsers don't throttle it
  // when the tab is in the background. The engine keeps trading as long as
  // this tab stays open (browser or laptop closed = engine stopped; true
  // 24/7 unattended operation requires a server-side deployment).
  useEffect(() => {
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
  }, [currentUser, onboarded, speed])

  if (!currentUser) return <Auth />
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
