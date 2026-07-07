import React from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, BrainCircuit, History, ShieldAlert, Radar, PieChart,
  Link2, Settings2, LogOut, OctagonX, Sun, Moon, BookOpen
} from 'lucide-react'
import { useStore } from '../store/store'
import { Badge, Segmented, Toggle } from './ui'
import { DISCLAIMER_SHORT } from '../types'
import { remote } from '../remote'

const TITLES: Record<string, string> = {
  '/': 'Trading Dashboard', '/strategy': 'Strategy Engine', '/history': 'Trade History',
  '/risk': 'Risk Management', '/intel': 'Market Intelligence', '/portfolio': 'Portfolio',
  '/brokers': 'Broker Connections', '/admin': 'Admin Console', '/guide': 'Setup Guide'
}

export default function Layout() {
  const loc = useLocation()
  const regime = useStore(s => s.regime)
  const tradingMode = useStore(s => s.tradingMode)
  const autoTrading = useStore(s => s.autoTrading)
  const setAutoTrading = useStore(s => s.setAutoTrading)
  const emergencyStop = useStore(s => s.emergencyStop)
  const setEmergencyStop = useStore(s => s.setEmergencyStop)
  const autoPaused = useStore(s => s.autoPaused)
  const killSwitch = useStore(s => s.killSwitch)
  const brokerConn = useStore(s => s.brokerConn)
  const serverOk = useStore(s => s.serverOk)
  const logOut = useStore(s => s.logOut)
  const theme = useStore(s => s.theme)
  const setTheme = useStore(s => s.setTheme)
  const setTradingMode = useStore(s => s.setTradingMode)
  const profile = useStore(s => s.profile)

  // Pure view switch — pipelines run in parallel regardless; live ORDER
  // routing is gated separately in the engine (credentials + unlock chain).
  const switchMode = (m: 'paper' | 'live') => setTradingMode(m)

  const regimeTone = regime === 'Trending' ? 'green' : regime === 'Risk-Off' ? 'red' : regime === 'Volatile' ? 'amber' : 'blue'
  const paperOk = brokerConn.paper.status === 'connected'
  const selectedLiveBroker = profile.broker === 'binance' || profile.broker === 'ibkr' ? profile.broker : null
  const liveBrokerOk = selectedLiveBroker ? brokerConn[selectedLiveBroker].status === 'connected' : brokerConn.binance.status === 'connected' || brokerConn.ibkr.status === 'connected'
  const brokerOk = tradingMode === 'live' ? liveBrokerOk : paperOk

  const item = (to: string, icon: React.ReactNode, label: string) => (
    <NavLink to={to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>{icon}<span>{label}</span></NavLink>
  )

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-mark">A</div>
          <div className="logo-name">AutoAlpha<span>AI</span></div>
        </div>
        <nav className="nav">
          {item('/', <LayoutDashboard size={17} />, 'Dashboard')}
          {item('/strategy', <BrainCircuit size={17} />, 'Strategy Engine')}
          {item('/intel', <Radar size={17} />, 'Market Intel')}
          {item('/portfolio', <PieChart size={17} />, 'Portfolio')}
          {item('/history', <History size={17} />, 'Trade History')}
          <div className="nav-sep">Controls</div>
          {item('/risk', <ShieldAlert size={17} />, 'Risk Management')}
          {item('/brokers', <Link2 size={17} />, 'Brokers')}
          <div className="nav-sep">Operations</div>
          {item('/admin', <Settings2 size={17} />, 'Admin Console')}
          {item('/guide', <BookOpen size={17} />, 'Setup Guide')}
          <button className="nav-item" onClick={logOut} style={{ marginTop: 'auto' }}><LogOut size={17} /><span>Sign out</span></button>
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <h1>{TITLES[loc.pathname] ?? 'AutoAlpha AI'}</h1>
          <div className="seg" title="View filter: paper and live pipelines run in parallel; this selects which one all tabs display">
            <button className={tradingMode === 'paper' ? 'active' : ''} onClick={() => switchMode('paper')}>PAPER</button>
            <button className={tradingMode === 'live' ? 'active' : ''} style={tradingMode === 'live' ? { background: 'var(--red)' } : undefined} onClick={() => switchMode('live')}>LIVE</button>
          </div>
          {/* Quiet by default — status badges appear only when something needs attention */}
          {remote.active && !serverOk && <Badge tone="red">SERVER UNREACHABLE</Badge>}
          {!brokerOk && <Badge tone="red">{tradingMode === 'live' ? 'Live broker offline' : 'Paper broker offline'}</Badge>}
          {killSwitch && <Badge tone="red">KILL SWITCH</Badge>}
          {autoPaused && <Badge tone="amber">LIVE RISK PAUSED</Badge>}
          {emergencyStop && <Badge tone="red">EMERGENCY STOP</Badge>}
          <Badge tone={regimeTone as any}>{regime}</Badge>
          <div className="row" title="AI auto-trading">
            <span className="small">AI</span>
            <Toggle on={autoTrading} disabled={emergencyStop || killSwitch} onChange={setAutoTrading} />
          </div>
          <button className="btn sm ghost" title="Toggle light/dark theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button className={`btn sm ${emergencyStop ? '' : 'danger'}`} onClick={() => setEmergencyStop(!emergencyStop)}>
            <OctagonX size={14} /> {emergencyStop ? 'Release stop' : 'Emergency stop'}
          </button>
        </header>

        <main className="content"><Outlet /></main>

        <footer className="footer-disclaimer">
          <strong>Risk disclosure:</strong> {DISCLAIMER_SHORT} AutoAlpha AI is non-custodial: your funds remain in
          your own broker account at all times; this platform only transmits authorized order instructions through
          official broker APIs. Trading financial instruments carries a risk of loss that may exceed your initial
          investment in some products. Nothing on this platform is investment, legal, or tax advice.
        </footer>
      </div>
    </div>
  )
}
