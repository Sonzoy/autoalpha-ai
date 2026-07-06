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
  /** Actually executed base quantity net of base-asset fees — what the
   *  account really holds/sold. Ledger positions must use this, not the
   *  requested qty, or spot closes can exceed the sellable balance. */
  filledQty?: number
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
  /** False for venues that cannot open short positions (e.g. spot exchanges).
   *  Undefined/true means shorting is supported. Used to keep the engine from
   *  generating short proposals that could never execute. */
  readonly canShort?: boolean

  status(): BrokerStatus
  healthy(): boolean
  /** For real venues with a fixed tradable set (e.g. spot exchanges), returns
   *  whether an app symbol maps to a routable pair. Undefined = no restriction
   *  (paper/placeholder venues accept the whole universe). */
  supportsSymbol?(symbol: string): boolean
  connect(): Promise<ConnectResult>
  disconnect(): void
  previewOrder(req: OrderRequest, availableCash: number): OrderPreview
  placeOrder(preview: OrderPreview): Promise<OrderResult>
  cancelOrder(orderId: string): boolean
  sync(): Promise<{ ok: boolean; message: string }>
}
