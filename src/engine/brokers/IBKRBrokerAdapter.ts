import type { BrokerStatus } from '../../types'
import { AuditLogger } from '../AuditLogger'
import type { BrokerAdapter, ConnectResult, OrderPreview, OrderRequest, OrderResult } from './BrokerAdapter'

/**
 * IBKRBrokerAdapter — Interactive Brokers integration (primary real-broker
 * target; IBKR's Client Portal API / TWS API are mature and well documented).
 *
 * This build ships a realistic placeholder: it simulates the OAuth/gateway
 * handshake and exposes read-only status. Real order transmission requires
 * API credentials, a running gateway session, and live-trading unlock.
 * Wire the real calls into connect()/placeOrder()/sync() — the rest of the
 * app is already coded against the BrokerAdapter contract.
 */
export class IBKRBrokerAdapter implements BrokerAdapter {
  readonly id = 'ibkr' as const
  readonly name = 'Interactive Brokers'
  readonly description = 'Connects to your IBKR account via the Client Portal API. Funds stay at IBKR; AutoAlpha only sends authorized order instructions.'
  readonly capabilities = [
    'Read balance', 'Read positions', 'Order history', 'Market data',
    'Order preview', 'Place order (requires live unlock)', 'Cancel order', 'Fill tracking', 'P&L sync'
  ]

  private st: BrokerStatus = 'disconnected'

  status(): BrokerStatus { return this.st }
  healthy(): boolean { return this.st === 'connected' }

  async connect(): Promise<ConnectResult> {
    this.st = 'connecting'
    AuditLogger.info('BROKER', 'IBKR connection initiated', 'Simulating Client Portal gateway handshake (placeholder — supply real API credentials to go further).')
    await delay(1200)
    this.st = 'connected'
    AuditLogger.info('BROKER', 'IBKR connected (read-only placeholder)', 'Account data endpoints simulated. Trading permission not granted without compliance review.')
    return {
      ok: true,
      message: 'IBKR link established in read-only mode. Live order routing requires API credentials, trading permissions, and compliance approval.',
      permissions: ['read:account', 'read:positions', 'read:orders']
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
      note: 'IBKR live routing not enabled in this build. Orders route to paper execution until live trading is unlocked with real credentials.'
    }
  }

  async placeOrder(_preview: OrderPreview): Promise<OrderResult> {
    AuditLogger.warn('BROKER', 'IBKR order blocked', 'Live trading locked: broker credentials, permissions, compliance review, and user authorization required.')
    return { ok: false, reason: 'Live trading is locked for IBKR in this build.' }
  }

  cancelOrder(_orderId: string): boolean { return false }

  async sync(): Promise<{ ok: boolean; message: string }> {
    await delay(400)
    return { ok: this.st === 'connected', message: this.st === 'connected' ? 'IBKR account snapshot refreshed (simulated).' : 'Not connected.' }
  }
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }
