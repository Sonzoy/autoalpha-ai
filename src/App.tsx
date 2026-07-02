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

  // Engine heartbeat
  useEffect(() => {
    if (!currentUser || !onboarded) return
    const id = setInterval(() => { void engineTick() }, SPEED_MS[speed] ?? 2500)
    return () => clearInterval(id)
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
