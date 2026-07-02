import type { BrokerStatus } from '../../types'
import { AuditLogger } from '../AuditLogger'
import type { BrokerAdapter, ConnectResult, OrderPreview, OrderRequest, OrderResult } from './BrokerAdapter'

/**
 * PaperBrokerAdapter — fully functional simulated execution venue.
 * Models slippage, commissions, occasional transient rejections, and
 * rare connection blips so the platform's error handling is exercised.
 * Cash accounting lives in the portfolio store; this adapter owns
 * connection state and execution mechanics.
 */
export class PaperBrokerAdapter implements BrokerAdapter {
  readonly id = 'paper' as const
  readonly name = 'AutoAlpha Paper Trading'
  readonly description = 'Simulated execution with realistic slippage and fills. No real money at risk.'
  readonly capabilities = [
    'Read balance', 'Read positions', 'Order history', 'Market data',
    'Order preview', 'Place order', 'Cancel order', 'Fill tracking', 'P&L sync'
  ]

  private st: BrokerStatus = 'disconnected'
  private blipUntil = 0

  status(): BrokerStatus { return this.st }
  healthy(): boolean { return this.st === 'connected' && Date.now() > this.blipUntil }

  async connect(): Promise<ConnectResult> {
    this.st = 'connecting'
    await delay(500)
    this.st = 'connected'
    AuditLogger.info('BROKER', 'Paper trading account connected', 'Simulated venue ready. Starting balance provided by portfolio ledger.')
    return { ok: true, message: 'Paper account ready.', permissions: ['read', 'trade (simulated)'] }
  }

  disconnect(): void {
    this.st = 'disconnected'
    AuditLogger.info('BROKER', 'Paper trading account disconnected')
  }

  previewOrder(req: OrderRequest, availableCash: number): OrderPreview {
    const value = req.qty * req.refPrice
    const slip = Math.min(0.25, 0.02 + Math.random() * 0.08) // percent
    const commission = Math.max(1, value * 0.0005)
    const affordable = req.direction === 'Long' ? value + commission <= availableCash : true
    return {
      request: req,
      estimatedValue: value,
      estimatedSlippagePct: round2(slip),
      commission: round2(commission),
      ok: affordable && req.qty > 0,
      note: !affordable
        ? `Insufficient simulated cash: need ${fmt(value + commission)}, have ${fmt(availableCash)}.`
        : `Est. value ${fmt(value)}, slippage ~${slip.toFixed(2)}%, commission ${fmt(commission)}.`
    }
  }

  async placeOrder(preview: OrderPreview): Promise<OrderResult> {
    if (!this.healthy()) {
      AuditLogger.error('BROKER', 'Order rejected — paper venue connection unhealthy')
      return { ok: false, reason: 'Broker connection unhealthy.' }
    }
    if (!preview.ok) return { ok: false, reason: preview.note }
    await delay(200 + Math.random() * 400)

    // Simulated transient failures (~4%) exercise rejection handling
    if (Math.random() < 0.04) {
      const reason = Math.random() < 0.5 ? 'Simulated venue rejection: insufficient liquidity at limit.' : 'Simulated venue timeout.'
      this.blipUntil = Date.now() + 2000
      AuditLogger.warn('BROKER', `Paper order rejected: ${preview.request.symbol}`, reason)
      return { ok: false, reason }
    }

    const req = preview.request
    const slipDir = req.direction === 'Long' ? 1 : -1
    const fillPrice = req.refPrice * (1 + slipDir * (preview.estimatedSlippagePct / 100) * Math.random())
    const orderId = `po-${Date.now()}-${Math.floor(Math.random() * 1e5)}`
    AuditLogger.info('BROKER', `Paper fill: ${req.direction} ${req.qty} ${req.symbol} @ ${fillPrice.toFixed(4)}`,
      `Order ${orderId}, commission ${fmt(preview.commission)}.`)
    return { ok: true, orderId, fillPrice, commission: preview.commission }
  }

  cancelOrder(orderId: string): boolean {
    AuditLogger.info('BROKER', `Paper order ${orderId} cancelled`)
    return true
  }

  async sync(): Promise<{ ok: boolean; message: string }> {
    await delay(150)
    return { ok: true, message: 'Paper portfolio ledger in sync.' }
  }
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }
function round2(x: number) { return Math.round(x * 100) / 100 }
function fmt(x: number) { return '$' + x.toLocaleString(undefined, { maximumFractionDigits: 2 }) }
