import type { BrokerId, BrokerStatus, Direction, Market, TradingMode } from '../../types'

/**
 * BrokerAdapter — the contract every broker integration implements.
 * AutoAlpha AI is non-custodial: funds never leave the user's broker
 * account. Adapters only read account data and transmit authorized
 * order instructions through official broker APIs.
 */

export interface OrderRequest {
  symbol: string
  market: Market
  direction: Direction
  qty: number
  refPrice: number
  stopLoss: number
  takeProfit: number
  mode: TradingMode
  /** True when this order closes/reduces an existing position (e.g. selling
   *  a held spot asset) — lets spot venues allow "Short" close orders. */
  reduceOnly?: boolean
}

export interface OrderPreview {
  request: OrderRequest
  estimatedValue: number
  estimatedSlippagePct: number
  commission: number
  ok: boolean
  note: string
}

export interface OrderResult {
  ok: boolean
  orderId?: string
  fillPrice?: number
  commission?: number
  reason?: string
}

export interface ConnectResult {
  ok: boolean
  message: string
  permissions: string[]
}

export interface BrokerAdapter {
  readonly id: BrokerId
  readonly name: string
  readonly description: string
  readonly capabilities: string[]

  status(): BrokerStatus
  healthy(): boolean
  connect(): Promise<ConnectResult>
  disconnect(): void
  previewOrder(req: OrderRequest, availableCash: number): OrderPreview
  placeOrder(preview: OrderPreview): Promise<OrderResult>
  cancelOrder(orderId: string): boolean
  sync(): Promise<{ ok: boolean; message: string }>
}
