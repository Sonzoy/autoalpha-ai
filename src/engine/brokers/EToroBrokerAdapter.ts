import type { BrokerStatus } from '../../types'
import { AuditLogger } from '../AuditLogger'
import type { BrokerAdapter, ConnectResult, OrderPreview, OrderRequest, OrderResult } from './BrokerAdapter'

/**
 * EToroBrokerAdapter — secondary integration target. eToro's public trading
 * API requires approved partner access, so this adapter ships as a
 * placeholder that models the approval-gated connection flow. Swap in real
 * endpoints once API access is granted.
 */
export class EToroBrokerAdapter implements BrokerAdapter {
  readonly id = 'etoro' as const
  readonly name = 'eToro'
  readonly description = 'Connects to your eToro account (requires approved eToro API access). Funds stay at eToro; AutoAlpha only sends authorized order instructions.'
  readonly capabilities = [
    'Read balance', 'Read positions', 'Order history',
    'Order preview', 'Place order (requires partner API approval + live unlock)', 'P&L sync'
  ]

  private st: BrokerStatus = 'disconnected'

  status(): BrokerStatus { return this.st }
  healthy(): boolean { return this.st === 'connected' }

  async connect(): Promise<ConnectResult> {
    this.st = 'connecting'
    AuditLogger.info('BROKER', 'eToro connection initiated', 'Placeholder flow — production access depends on approved eToro partner API credentials.')
    await delay(1400)
    this.st = 'error'
    AuditLogger.warn('BROKER', 'eToro connection pending approval', 'eToro trading API access requires partner approval. Connection held in pending state.')
    return {
      ok: false,
      message: 'eToro API access is approval-gated. Request partner API credentials from eToro, then reconnect. Paper trading remains fully available.',
      permissions: []
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
      note: 'eToro routing unavailable: partner API approval required.'
    }
  }

  async placeOrder(_preview: OrderPreview): Promise<OrderResult> {
    AuditLogger.warn('BROKER', 'eToro order blocked', 'No approved API access; live trading locked.')
    return { ok: false, reason: 'eToro API access not approved in this build.' }
  }

  cancelOrder(_orderId: string): boolean { return false }

  async sync(): Promise<{ ok: boolean; message: string }> {
    await delay(300)
    return { ok: false, message: 'eToro sync unavailable until API access is approved.' }
  }
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }
