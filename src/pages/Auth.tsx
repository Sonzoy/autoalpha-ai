import React, { useState } from 'react'
import { ShieldCheck, TrendingUp, Lock, Bot } from 'lucide-react'
import { useStore } from '../store/store'
import { DISCLAIMER_SHORT } from '../types'

type View = 'login' | 'signup' | 'forgot'

export default function Auth() {
  const [view, setView] = useState<View>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const signUp = useStore(s => s.signUp)
  const logIn = useStore(s => s.logIn)

  const submit = (e: React.FormEvent) => { e.preventDefault(); void handle() }

  const handle = async () => {
    setErr(null); setMsg(null); setBusy(true)
    try {
      if (view === 'signup') {
        if (!name.trim()) return setErr('Please enter your name.')
        const r = await signUp(name.trim(), email.trim().toLowerCase(), password)
        if (r) setErr(r)
      } else if (view === 'login') {
        const r = await logIn(email.trim().toLowerCase(), password)
        if (r) setErr(r)
      } else {
        setMsg('If an account exists for that email, a reset link has been sent. (Demo build — email delivery is not configured yet.)')
      }
    } finally { setBusy(false) }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="row" style={{ marginBottom: 18 }}>
          <div className="logo-mark">A</div>
          <div>
            <div className="logo-name" style={{ fontSize: 17 }}>AutoAlpha<span>AI</span></div>
            <div className="small">Automated trading operations console</div>
          </div>
        </div>

        {view === 'login' && <>
          <h1>Sign in</h1>
          <p className="sub">Access your trading workspace. Each account's data is isolated and passwords are stored as salted hashes.</p>
        </>}
        {view === 'signup' && <>
          <h1>Create your account</h1>
          <p className="sub">Non-custodial by design: your funds stay in your own broker account. AutoAlpha analyzes markets and transmits only authorized order instructions.</p>
        </>}
        {view === 'forgot' && <>
          <h1>Reset password</h1>
          <p className="sub">Enter the email associated with your account.</p>
        </>}

        <form onSubmit={submit}>
          {view === 'signup' && (
            <div className="field"><label>Full name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Trader" autoComplete="name" /></div>
          )}
          <div className="field"><label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" /></div>
          {view !== 'forgot' && (
            <div className="field"><label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required
                autoComplete={view === 'signup' ? 'new-password' : 'current-password'} />
              {view === 'signup' && <p className="small" style={{ marginTop: 5 }}>Accounts are stored locally in this browser — don't reuse a password from another service.</p>}
            </div>
          )}

          {err && <p style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 10 }}>{err}</p>}
          {msg && <p style={{ color: 'var(--green)', fontSize: 12.5, marginBottom: 10 }}>{msg}</p>}

          <button className="btn primary" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Please wait…' : view === 'signup' ? 'Create account' : view === 'login' ? 'Sign in' : 'Send reset link'}
          </button>
        </form>

        <div className="row spread mt" style={{ fontSize: 12.5 }}>
          {view !== 'login' && <a href="#" onClick={e => { e.preventDefault(); setView('login'); setErr(null); setMsg(null) }}>Sign in</a>}
          {view !== 'signup' && <a href="#" onClick={e => { e.preventDefault(); setView('signup'); setErr(null); setMsg(null) }}>Create account</a>}
          {view === 'login' && <a href="#" onClick={e => { e.preventDefault(); setView('forgot'); setErr(null); setMsg(null) }}>Forgot password?</a>}
        </div>

        <div className="mt" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div className="row" style={{ gap: 16, justifyContent: 'center' }}>
            <span className="small"><Lock size={11} style={{ verticalAlign: -1 }} /> Non-custodial</span>
            <span className="small"><Bot size={11} style={{ verticalAlign: -1 }} /> AI risk engine</span>
            <span className="small"><TrendingUp size={11} style={{ verticalAlign: -1 }} /> Live market data</span>
            <span className="small"><ShieldCheck size={11} style={{ verticalAlign: -1 }} /> Paper-first</span>
          </div>
        </div>

        <p className="small mt" style={{ textAlign: 'center' }}>{DISCLAIMER_SHORT}</p>
      </div>
    </div>
  )
}
