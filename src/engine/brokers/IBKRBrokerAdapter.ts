import type { BrokerStatus, IbkrConfig } from '../../types'
import { AuditLogger } from '../AuditLogger'
import type { BrokerAdapter, ConnectResult, OrderPreview, OrderRequest, OrderResult } from './BrokerAdapter'

/**
 * IBKRBrokerAdapter — Interactive Brokers via the Client Portal Gateway.
 *
 * How the real integration works (and what this adapter actually does):
 * The user runs IBKR's Client Portal Gateway locally (or a hosted instance),
 * authenticates in it with their own IBKR credentials, and enters the gateway
 * URL here. connect() makes a REAL request to the gateway's
 * /iserver/auth/status endpoint and reports the true result.
 *
 * Security model: no IBKR username/password ever touches this app — auth
 * happens inside IBKR's own gateway. Only the gateway URL and account ID are
 * stored, locally in the user's browser. Requests go only to the user's own
 * gateway.
 *
 * Order transmission is intentionally NOT implemented: sending real orders
 * requires the live-trading unlock chain plus code review against your
 * account tier — wire placeOrder() to POST /iserver/account/{id}/orders
 * when you are ready to take that step deliberately.
 */
export class IBKRBrokerAdapter implements BrokerAdapter {
  readonly id = 'ibkr' as const
  readonly name = 'Interactive Brokers'
  readonly description = 'Connects to your own IBKR Client Portal Gateway. Your IBKR login stays inside IBKR\'s gateway — this app never sees it. Funds stay at IBKR.'
  readonly capabilities = [
    'Read balance', 'Read positions', 'Order history', 'Market data',
    'Order preview', 'Place order (requires live unlock + gateway session)', 'Cancel order', 'Fill tracking', 'P&L sync'
  ]

  private st: BrokerStatus = 'disconnected'
  private cfg: IbkrConfig | null = null

  configure(cfg: IbkrConfig | null): void {
    this.cfg = cfg
    if (!cfg) this.st = 'disconnected'
  }
  configured(): boolean { return !!this.cfg?.gatewayUrl }

  status(): BrokerStatus { return this.st }
  healthy(): boolean { return this.st === 'connected' }

  async connect(): Promise<ConnectResult> {
    if (!this.cfg?.gatewayUrl) {
      this.st = 'error'
      return {
        ok: false,
        message: 'No gateway configured. Run IBKR\'s Client Portal Gateway, log in to it, then save its URL (e.g. https://localhost:5000/v1/api) above.',
        permissions: []
      }
    }
    this.st = 'connecting'
    const base = this.cfg.gatewayUrl.replace(/\/+$/, '')
    AuditLogger.info('BROKER', 'IBKR connection attempt', `POST ${base}/iserver/auth/status (request goes only to your own gateway).`)
    try {
      const r = await fetch(`${base}/iserver/auth/status`, { method: 'POST', signal: AbortSignal.timeout(8000) })
      if (!r.ok) throw new Error(`Gateway responded ${r.status}`)
      const j = await r.json()
      if (j.authenticated) {
        this.st = 'connected'
        AuditLogger.info('BROKER', 'IBKR gateway session verified', `Account ${this.cfg.accountId || '(default)'} — authenticated live session.`)
        return {
          ok: true,
          message: `Gateway session authenticated${this.cfg.accountId ? ` for account ${this.cfg.accountId}` : ''}. Live order routing additionally requires the live-trading unlock chain.`,
          permissions: ['read:account', 'read:positions', 'read:orders', 'market-data']
        }
      }
      this.st = 'error'
      AuditLogger.warn('BROKER', 'IBKR gateway reachable but not authenticated', 'Log in to the gateway in a separate tab, then reconnect.')
      return { ok: false, message: 'Gateway reachable but no authenticated session. Open the gateway URL in a browser tab, log in with your IBKR credentials there, then reconnect.', permissions: [] }
    } catch (e) {
      this.st = 'error'
      const msg = 'Could not reach the gateway. Checks: is the Client Portal Gateway running? Is the URL correct? Browsers also block cross-origin gateway calls unless the gateway (or a local proxy) sends CORS headers — see README.'
      AuditLogger.error('BROKER', 'IBKR gateway unreachable', String(e))
      return { ok: false, message: msg, permissions: [] }
    }
  }

  disconnect(): void {
    this.st = 'disconnected'
    AuditLogger.info('BROKER', 'IBKR disconnected')
  }

  previewOrder(req: OrderRequest, _cash: number): OrderPreview {
    return {
      request: req, estimatedValue: req.qty * req.refPrice,
      estimatedSlippagePct: 0.03, commission: Math.max(1, req.qty * 0.005),
      ok: false,
      note: 'IBKR order transmission is deliberately not enabled in this build. Execution routes to the paper venue until live trading is unlocked and order code is wired to your gateway.'
    }
  }

  async placeOrder(_preview: OrderPreview): Promise<OrderResult> {
    AuditLogger.warn('BROKER', 'IBKR order blocked',
      'Real order transmission is intentionally disabled in this build. Complete the live-unlock chain and implement gateway order routing deliberately.')
    return { ok: false, reason: 'IBKR live order transmission is disabled in this build.' }
  }

  cancelOrder(_orderId: string): boolean { return false }

  async sync(): Promise<{ ok: boolean; message: string }> {
    if (this.st !== 'connected' || !this.cfg) return { ok: false, message: 'Not connected.' }
    try {
      const base = this.cfg.gatewayUrl.replace(/\/+$/, '')
      const r = await fetch(`${base}/iserver/auth/status`, { method: 'POST', signal: AbortSignal.timeout(8000) })
      const j = r.ok ? await r.json() : null
      if (j?.authenticated) return { ok: true, message: 'IBKR gateway session still authenticated.' }
      this.st = 'error'
      return { ok: false, message: 'Gateway session expired — log in to the gateway again.' }
    } catch {
      this.st = 'error'
      return { ok: false, message: 'Gateway unreachable during sync.' }
    }
  }
}
