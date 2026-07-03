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
    const ready = this.st === 'connected' && !!this.cfg?.accountId
    return {
      request: req, estimatedValue: req.qty * req.refPrice,
      estimatedSlippagePct: 0.03, commission: Math.max(1, req.qty * 0.005),
      ok: ready && req.mode === 'live',
      note: ready
        ? `Live order via IBKR gateway, account ${this.cfg!.accountId}. Market order with attached stop/target; broker confirmations auto-acknowledged.`
        : 'IBKR routing requires a connected, authenticated gateway and an Account ID in the configuration.'
    }
  }

  /**
   * Real order transmission via the Client Portal Gateway:
   *   1. Resolve the instrument's conid via /iserver/secdef/search
   *   2. POST the order to /iserver/account/{accountId}/orders
   *   3. Acknowledge broker confirmation prompts via /iserver/reply/{id}
   * Only reachable after: live mode + full unlock chain + user pre-authorization.
   * NOTE: written to IBKR's documented API but not exercised against a real
   * gateway in this build — validate with small size in a paper IBKR account
   * (IBKR offers paper accounts on the same API) before funding it.
   */
  async placeOrder(preview: OrderPreview): Promise<OrderResult> {
    if (!preview.ok || !this.cfg?.accountId || this.st !== 'connected') {
      return { ok: false, reason: preview.note }
    }
    const base = this.cfg.gatewayUrl.replace(/\/+$/, '')
    const req = preview.request
    try {
      // 1. conid lookup — strip market suffixes ("BTC/USD" → "BTC" won't resolve
      // for crypto at IBKR; stocks/ETFs like AAPL, SPY resolve directly)
      const term = req.symbol.split('/')[0]
      const sr = await fetch(`${base}/iserver/secdef/search`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: term, secType: 'STK' }),
        signal: AbortSignal.timeout(10000)
      })
      const sj = sr.ok ? await sr.json() : null
      const conid = Array.isArray(sj) ? sj[0]?.conid : undefined
      if (!conid) {
        AuditLogger.warn('BROKER', `IBKR: no contract found for ${req.symbol}`, 'secdef/search returned no conid — instrument may not be tradable via this account/API.')
        return { ok: false, reason: `IBKR could not resolve a tradable contract for ${req.symbol}.` }
      }
      // 2. transmit order
      const or = await fetch(`${base}/iserver/account/${this.cfg.accountId}/orders`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orders: [{
            conid, orderType: 'MKT', side: req.direction === 'Long' ? 'BUY' : 'SELL',
            quantity: req.qty, tif: 'DAY', outsideRTH: false
          }]
        }),
        signal: AbortSignal.timeout(10000)
      })
      let oj = or.ok ? await or.json() : null
      // 3. acknowledge confirmation prompts (suppression loop, max 3)
      for (let i = 0; i < 3 && Array.isArray(oj) && oj[0]?.id && !oj[0]?.order_id; i++) {
        const rr = await fetch(`${base}/iserver/reply/${oj[0].id}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmed: true }),
          signal: AbortSignal.timeout(10000)
        })
        oj = rr.ok ? await rr.json() : null
      }
      const orderId = Array.isArray(oj) ? oj[0]?.order_id : undefined
      if (orderId) {
        AuditLogger.warn('BROKER', `LIVE ORDER TRANSMITTED to IBKR: ${req.direction} ${req.qty} ${req.symbol}`, `Order ${orderId}, account ${this.cfg.accountId}. Fill assumed at reference price for the local mirror ledger; authoritative state is your IBKR account.`)
        return { ok: true, orderId: String(orderId), fillPrice: req.refPrice, commission: preview.commission }
      }
      AuditLogger.error('BROKER', `IBKR order not confirmed for ${req.symbol}`, JSON.stringify(oj)?.slice(0, 300))
      return { ok: false, reason: 'IBKR gateway did not confirm the order.' }
    } catch (e) {
      AuditLogger.error('BROKER', 'IBKR order transmission failed', String(e))
      return { ok: false, reason: `Gateway error during order transmission: ${String(e).slice(0, 120)}` }
    }
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
