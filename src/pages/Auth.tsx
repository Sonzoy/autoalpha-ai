import React, { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useStore } from '../store/store'
import { DISCLAIMER_SHORT } from '../types'

type View = 'login' | 'signup' | 'forgot' | '2fa'

export default function Auth() {
  const [view, setView] = useState<View>('signup')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [pendingLogin, setPendingLogin] = useState<{ email: string; password: string } | null>(null)
  const signUp = useStore(s => s.signUp)
  const logIn = useStore(s => s.logIn)

  const submit = (e: React.FormEvent) => { e.preventDefault(); void handle() }

  const handle = async () => {
    setErr(null); setMsg(null)
    if (view === 'signup') {
      if (!name.trim()) return setErr('Please enter your name.')
      const r = await signUp(name.trim(), email.trim().toLowerCase(), password)
      if (r) setErr(r)
    } else if (view === 'login') {
      // 2FA placeholder step before completing login (credentials verified at final step)
      const u = useStore.getState().users.find(x => x.email === email.trim().toLowerCase())
      if (!u) return setErr('Invalid email or password.')
      setPendingLogin({ email: email.trim().toLowerCase(), password })
      setView('2fa')
    } else if (view === '2fa') {
      if (code.trim().length !== 6) return setErr('Enter the 6-digit code (any 6 digits in this demo).')
      if (pendingLogin) {
        const r = await logIn(pendingLogin.email, pendingLogin.password)
        if (r) { setErr(r); setView('login') }
      }
    } else if (view === 'forgot') {
      setMsg('If an account exists for that email, a reset link has been sent (demo placeholder — no email is actually sent).')
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="row">
          <div className="logo-mark">A</div>
          <div className="logo-name" style={{ fontSize: 17 }}>AutoAlpha<span>AI</span></div>
        </div>

        {view === 'signup' && <>
          <h1>Create your account</h1>
          <p className="sub">Non-custodial AI trading assistant. Your money stays in your own broker account — AutoAlpha only sends authorized trade instructions.</p>
        </>}
        {view === 'login' && <>
          <h1>Welcome back</h1>
          <p className="sub">Sign in to your trading operations console.</p>
        </>}
        {view === 'forgot' && <>
          <h1>Reset password</h1>
          <p className="sub">Enter your email and we'll send a reset link.</p>
        </>}
        {view === '2fa' && <>
          <h1><ShieldCheck size={18} style={{ verticalAlign: -3 }} /> Two-factor authentication</h1>
          <p className="sub">Enter the 6-digit code from your authenticator app. (Placeholder — any 6 digits work in this demo build.)</p>
        </>}

        <form onSubmit={submit}>
          {view === 'signup' && (
            <div className="field"><label>Full name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Trader" /></div>
          )}
          {view !== '2fa' && (
            <div className="field"><label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required /></div>
          )}
          {(view === 'signup' || view === 'login') && (
            <div className="field"><label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
              {view === 'signup' && <p className="small" style={{ marginTop: 5 }}>Demo build with browser-local accounts — don't reuse a password from a real account. Passwords are stored as salted hashes; your workspace is isolated per account.</p>}
            </div>
          )}
          {view === '2fa' && (
            <div className="field"><label>Authentication code</label>
              <input value={code} onChange={e => setCode(e.target.value)} placeholder="000000" maxLength={6} className="mono" /></div>
          )}

          {err && <p style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 10 }}>{err}</p>}
          {msg && <p style={{ color: 'var(--green)', fontSize: 12.5, marginBottom: 10 }}>{msg}</p>}

          <button className="btn primary" style={{ width: '100%' }}>
            {view === 'signup' ? 'Create account' : view === 'login' ? 'Continue' : view === '2fa' ? 'Verify & sign in' : 'Send reset link'}
          </button>
        </form>

        <div className="row spread mt" style={{ fontSize: 12.5 }}>
          {view !== 'login' && <a href="#" onClick={e => { e.preventDefault(); setView('login'); setErr(null) }}>Sign in</a>}
          {view !== 'signup' && <a href="#" onClick={e => { e.preventDefault(); setView('signup'); setErr(null) }}>Create account</a>}
          {view === 'login' && <a href="#" onClick={e => { e.preventDefault(); setView('forgot'); setErr(null) }}>Forgot password?</a>}
        </div>

        <p className="small mt">{DISCLAIMER_SHORT}</p>
      </div>
    </div>
  )
}
