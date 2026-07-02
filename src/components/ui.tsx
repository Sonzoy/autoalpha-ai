import React from 'react'

export function Badge({ tone, children }: { tone: 'green' | 'red' | 'amber' | 'blue' | 'gray'; children: React.ReactNode }) {
  return <span className={`badge ${tone}`}><span className="dot" />{children}</span>
}

export function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" className={`toggle ${on ? 'on' : ''}`} disabled={disabled}
      onClick={() => onChange(!on)} aria-pressed={on}>
      <span className="knob" />
    </button>
  )
}

export function Segmented<T extends string | number>({ options, value, onChange, labels }: {
  options: T[]; value: T; onChange: (v: T) => void; labels?: (v: T) => string
}) {
  return (
    <div className="seg">
      {options.map(o => (
        <button key={String(o)} className={o === value ? 'active' : ''} onClick={() => onChange(o)}>
          {labels ? labels(o) : String(o)}
        </button>
      ))}
    </div>
  )
}

export function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  )
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string }) {
  return (
    <div className="card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone ?? ''}`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

export function Meter({ value, color }: { value: number; color: string }) {
  return (
    <div className="meter">
      <div style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} />
    </div>
  )
}

export const fmtUsd = (x: number, d = 2) =>
  (x < 0 ? '-$' : '$') + Math.abs(x).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })
export const fmtNum = (x: number, d = 2) => x.toLocaleString(undefined, { maximumFractionDigits: d })
export const fmtPct = (x: number, d = 2) => `${x >= 0 ? '+' : ''}${x.toFixed(d)}%`
export const fmtTime = (ts: number) => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })

export function statusTone(s: string): 'green' | 'red' | 'amber' | 'blue' | 'gray' {
  switch (s) {
    case 'Filled': case 'connected': return 'green'
    case 'Rejected': case 'error': return 'red'
    case 'Proposed': case 'connecting': return 'amber'
    case 'Approved': case 'Submitted': return 'blue'
    case 'Closed': return 'gray'
    default: return 'gray'
  }
}
