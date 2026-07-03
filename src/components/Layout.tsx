import React from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useState } from 'react'
import {
  LayoutDashboard, BrainCircuit, History, ShieldAlert, Radar, PieChart,
  Link2, Settings2, LogOut, OctagonX, Activity, Sun, Moon
} from 'lucide-react'
import { Modal } from './ui'
import { useStore } from '../store/store'
import { Badge, Segmented, Toggle } from './ui'
import { DISCLAIMER_SHORT } from '../types'

const TITLES: Record<string, string> = {
  '/': 'Trading Dashboard', '/strategy': 'Strategy Engine', '/history': 'Trade History',
  '/risk': 'Risk Management', '/intel': 'Market Intelligence', '/portfolio': 'Portfolio',
  '/brokers': 'Broker Connections', '/admin': 'Admin Console'
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
  const speed = useStore(s => s.speed)
  const setSpeed = useStore(s => s.setSpeed)
  const brokerConn = useStore(s => s.brokerConn)
  const logOut = useStore(s => s.logOut)
  const theme = useStore(s => s.theme)
  const setTheme = useStore(s => s.setTheme)
  const liveUnlocked = useStore(s => s.liveUnlocked)
  const adminApprovedLive = useStore(s => s.adminApprovedLive)
  const setTradingMode = useStore(s => s.setTradingMode)
  const [liveBlocked, setLiveBlocked] = useState(false)

  const switchMode = (m: 'paper' | 'live') => {
    if (m === 'live' && !(liveUnlocked && adminApprovedLive)) { setLiveBlocked(true); return }
    setTradingMode(m)
  }

  const regimeTone = regime === 'Trending' ? 'green' : regime === 'Risk-Off' ? 'red' : regime === 'Volatile' ? 'amber' : 'blue'
  const paperOk = brokerConn.paper.status === 'connected'

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
          <button className="nav-item" onClick={logOut} style={{ marginTop: 'auto' }}><LogOut size={17} /><span>Sign out</span></button>
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <h1>{TITLES[loc.pathname] ?? 'AutoAlpha AI'}</h1>
          <div className="seg" title="Trading mode">
            <button className={tradingMode === 'paper' ? 'active' : ''} onClick={() => switchMode('paper')}>PAPER</button>
            <button className={tradingMode === 'live' ? 'active' : ''} style={tradingMode === 'live' ? { background: 'var(--red)' } : undefined} onClick={() => switchMode('live')}>LIVE</button>
          </div>
          <Badge tone={regimeTone as any}>{regime}</Badge>
          <Badge tone={paperOk ? 'green' : 'gray'}>{paperOk ? 'Broker OK' : 'Broker offline'}</Badge>
          {killSwitch && <Badge tone="red">KILL SWITCH</Badge>}
          {autoPaused && <Badge tone="amber">RISK PAUSED</Badge>}
          {emergencyStop && <Badge tone="red">EMERGENCY STOP</Badge>}
          <div className="row" title="Simulation speed">
            <Activity size={14} color="var(--text-3)" />
            <Segmented options={[1, 10, 60] as const} value={speed} onChange={v => setSpeed(v)} labels={v => `${v}x`} />
          </div>
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

        <Modal open={liveBlocked} onClose={() => setLiveBlocked(false)}>
          <h2>Live trading is locked</h2>
          <p>Switching to live mode requires the full authorization chain: a connected real broker (IBKR gateway),
            a live-trading unlock request, compliance review with admin approval, and your explicit enablement —
            all on the Brokers page. This protects you from accidentally routing real orders.</p>
          <div className="row spread mt">
            <button className="btn" onClick={() => setLiveBlocked(false)}>Close</button>
            <a className="btn primary" href="#/brokers" onClick={() => setLiveBlocked(false)}>Open Brokers page</a>
          </div>
        </Modal>

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
