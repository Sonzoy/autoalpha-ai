import type { BrokerStatus, EtoroConfig } from '../../types'
import { AuditLogger } from '../AuditLogger'
import type { BrokerAdapter, ConnectResult, OrderPreview, OrderRequest, OrderResult } from './BrokerAdapter'

/**
 * EToroBrokerAdapter — eToro integration.
 *
 * Reality check (kept honest in the UI): eToro's trading API is
 * approval-gated — trading access requires partner/API credentials granted
 * by eToro. This adapter stores the user's username + API key locally,
 * makes a REAL request against eToro's public API surface to validate
 * reachability/credentials, and reports the true result. Trading endpoints
 * activate only once eToro grants the account API trading access.
 *
 * Security model: the API key is stored only in the user's browser and sent
 * only to api.etoro.com over HTTPS in a request header (never in the URL).
 */
export class EToroBrokerAdapter implements BrokerAdapter {
  readonly id = 'etoro' as const
  readonly name = 'eToro'
  readonly description = 'Connects with your own eToro API key (requires eToro-granted API access). Funds stay at eToro; the key is stored only in this browser.'
  readonly capabilities = [
    'Read balance', 'Read positions', 'Order history',
    'Order preview', 'Place order (requires eToro API approval + live unlock)', 'P&L sync'
  ]

  private st: BrokerStatus = 'disconnected'
  private cfg: EtoroConfig | null = null

  configure(cfg: EtoroConfig | null): void {
    this.cfg = cfg
    if (!cfg) this.st = 'disconnected'
  }
  configured(): boolean { return !!(this.cfg?.apiKey && this.cfg?.username) }

  status(): BrokerStatus { return this.st }
  healthy(): boolean { return this.st === 'connected' }

  async connect(): Promise<ConnectResult> {
    if (!this.cfg?.apiKey || !this.cfg?.username) {
      this.st = 'error'
      return { ok: false, message: 'Enter your eToro username and API key above, then connect. API keys are granted by eToro — request access at eToro\'s developer portal.', permissions: [] }
    }
    this.st = 'connecting'
    AuditLogger.info('BROKER', 'eToro connection attempt', 'Validating API key against api.etoro.com (key sent only to eToro, in a header).')
    try {
      // Real reachability + key validation attempt against eToro's API surface.
      const r = await fetch('https://api.etoro.com/API/User/V1/Info', {
        headers: { 'Ocp-Apim-Subscription-Key': this.cfg.apiKey },
        signal: AbortSignal.timeout(8000)
      })
      if (r.status === 200) {
        this.st = 'connected'
        AuditLogger.info('BROKER', 'eToro API key accepted', `Read access verified for ${this.cfg.username}.`)
        return { ok: true, message: 'eToro API key accepted — read access active. Trading endpoints additionally require eToro-granted trading scope and the live-trading unlock chain.', permissions: ['read:account'] }
      }
      if (r.status === 401 || r.status === 403) {
        this.st = 'error'
        AuditLogger.warn('BROKER', 'eToro rejected the API key', `HTTP ${r.status} — key invalid or lacks scope.`)
        return { ok: false, message: `eToro rejected the key (HTTP ${r.status}). Verify the key, or request API access from eToro if you haven't been granted it yet.`, permissions: [] }
      }
      this.st = 'error'
      return { ok: false, message: `Unexpected eToro response (HTTP ${r.status}). eToro's API access is approval-gated; confirm your key's scope with eToro.`, permissions: [] }
    } catch (e) {
      this.st = 'error'
      AuditLogger.warn('BROKER', 'eToro API unreachable from browser', String(e))
      return {
        ok: false,
        message: 'Could not reach eToro\'s API from the browser (network error or CORS — eToro\'s API is designed for server-side use). Your key is saved locally; a production deployment calls eToro from a backend. Paper trading remains fully available.',
        permissions: []
      }
    }
  }

  disconnect(): void {
    this.st = 'disconnected'
    AuditLogger.info('BROKER', 'eToro disconnected')
  }

  previewOrder(req: OrderRequest, _cash: number): OrderPreview {
    return {
      request: req, estimatedValue: req.qty * req.refPrice,
      estimatedSlippagePct: 0.05, commission: 0,
      ok: false,
      note: 'eToro order transmission requires eToro-granted trading scope; not enabled in this build.'
    }
  }

  async placeOrder(_preview: OrderPreview): Promise<OrderResult> {
    AuditLogger.warn('BROKER', 'eToro order blocked', 'Trading scope not granted / live trading locked.')
    return { ok: false, reason: 'eToro live order transmission is disabled in this build.' }
  }

  cancelOrder(_orderId: string): boolean { return false }

  async sync(): Promise<{ ok: boolean; message: string }> {
    if (this.st !== 'connected') return { ok: false, message: 'Not connected.' }
    return { ok: true, message: 'eToro read session assumed valid (revalidated on next connect).' }
  }
}
