import type { AuditCategory, AuditEvent, AuditSeverity } from '../types'

/**
 * AuditLogger — central, append-only record of every automated decision:
 * market events, strategy selections, risk approvals/rejections, orders,
 * broker events, and admin actions. The UI subscribes via a sink so the
 * logger stays decoupled from state management.
 */

type Sink = (e: AuditEvent) => void

let sink: Sink | null = null
let counter = 0

export const AuditLogger = {
  attach(s: Sink) { sink = s },

  log(category: AuditCategory, severity: AuditSeverity, message: string, detail?: string): AuditEvent {
    const e: AuditEvent = {
      id: `ae-${Date.now()}-${counter++}`,
      ts: Date.now(),
      category, severity, message, detail
    }
    if (sink) sink(e)
    return e
  },

  info(cat: AuditCategory, msg: string, detail?: string) { return this.log(cat, 'info', msg, detail) },
  warn(cat: AuditCategory, msg: string, detail?: string) { return this.log(cat, 'warn', msg, detail) },
  error(cat: AuditCategory, msg: string, detail?: string) { return this.log(cat, 'error', msg, detail) }
}
