import type { BinanceConfig, BrokerStatus } from '../../types'
import { AuditLogger } from '../AuditLogger'
import type { BrokerAdapter, ConnectResult, OrderPreview, OrderRequest, OrderResult } from './BrokerAdapter'

/**
 * BinanceBrokerAdapter — real spot trading via Binance's official REST API.
 *
 * How it works: the user creates an API key in their own Binance account
 * (recommended: enable ONLY "Read" + "Spot Trading", DISABLE withdrawals,
 * and restrict to the server's IP). Requests are HMAC-SHA256 signed; the
 * secret never leaves this machine and is never transmitted — only the
 * signature is. The API key travels in a request header.
 *
 * Constraints kept honest:
 *  - SPOT ONLY: opening short positions is impossible on spot. Short
 *    proposals are rejected with a logged reason; selling to CLOSE a held
 *    long is allowed (reduceOnly).
 *  - Intended for server mode (`npm run server`): browsers may block the
 *    signed endpoints via CORS, and an API secret must not live in a
 *    public web page.
 *  - The in-app ledger mirrors fills; your Binance account is authoritative.
 */

const SYMBOL_MAP: Record<string, string> = {
  'BTC/USD': 'BTCUSDT', 'ETH/USD': 'ETHUSDT', 'SOL/USD': 'SOLUSDT',
  'DOGE/USD': 'DOGEUSDT', 'XRP/USD': 'XRPUSDT', 'AVAX/USD': 'AVAXUSDT',
  'LINK/USD': 'LINKUSDT', 'ADA/USD': 'ADAUSDT'
}

interface SymbolFilter { stepSize: number; minQty: number; minNotional: number }

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export class BinanceBrokerAdapter implements BrokerAdapter {
  readonly id = 'binance' as const
  readonly name = 'Binance'
  readonly canShort = false // spot accounts are long-only
  readonly description = 'Real spot trading on your own Binance account via signed API requests. Long-only (spot cannot short). Funds stay at Binance.'
  readonly capabilities = [
    'Read balances', 'Market data', 'Order preview', 'Place spot market order (long / close-long)',
    'Fill tracking', 'P&L sync', 'No shorts (spot)', 'No withdrawals (use a key with withdrawals disabled)'
  ]

  private st: BrokerStatus = 'disconnected'
  private cfg: BinanceConfig | null = null
  private filters: Record<string, SymbolFilter> = {}
  private usdtFree = 0
  private balances: { asset: string; qty: number; free: number }[] = []

  /** Cached real account balances (refreshed on connect/sync). */
  getCachedBalances(): { asset: string; qty: number; free: number }[] { return this.balances }

  private cacheBalances(acctJson: any): void {
    this.balances = (acctJson?.balances ?? [])
      .map((b: any) => ({ asset: b.asset, qty: Number(b.free) + Number(b.locked), free: Number(b.free) }))
      .filter((b: { qty: number }) => b.qty > 0)
  }

  /** Free (sellable) balance of an asset, 0 if unknown. */
  private freeOf(asset: string): number {
    return this.balances.find(b => b.asset === asset)?.free ?? 0
  }

  configure(cfg: BinanceConfig | null): void {
    this.cfg = cfg
    if (!cfg) this.st = 'disconnected'
  }
  configured(): boolean { return !!(this.cfg?.apiKey && this.cfg?.apiSecret) }

  status(): BrokerStatus { return this.st }
  healthy(): boolean { return this.st === 'connected' }
  /** Only symbols mapped to a Binance spot pair are routable. */
  supportsSymbol(symbol: string): boolean { return !!SYMBOL_MAP[symbol] }

  private async signed(path: string, params: Record<string, string | number>, method: 'GET' | 'POST' = 'GET'):
    Promise<{ ok: boolean; status: number; j: any }> {
    if (!this.cfg) return { ok: false, status: 0, j: null }
    const q = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), timestamp: String(Date.now()), recvWindow: '10000' }).toString()
    const signature = await hmacHex(this.cfg.apiSecret, q)
    const r = await fetch(`https://api.binance.com${path}?${q}&signature=${signature}`, {
      method, headers: { 'X-MBX-APIKEY': this.cfg.apiKey }, signal: AbortSignal.timeout(10000)
    })
    const j = await r.json().catch(() => null)
    return { ok: r.ok, status: r.status, j }
  }

  async connect(): Promise<ConnectResult> {
    if (!this.configured()) {
      this.st = 'error'
      return { ok: false, message: 'Enter your Binance API key and secret first (create one in Binance → API Management; enable Read + Spot Trading only, disable withdrawals, IP-restrict it).', permissions: [] }
    }
    this.st = 'connecting'
    AuditLogger.info('BROKER', 'Binance connection attempt', 'Signed request to /api/v3/account — the secret never leaves this machine.')
    try {
      const acct = await this.signed('/api/v3/account', {})
      if (!acct.ok) {
        this.st = 'error'
        const why = acct.j?.msg ?? `HTTP ${acct.status}`
        AuditLogger.warn('BROKER', 'Binance rejected the credentials', String(why))
        return { ok: false, message: `Binance rejected the request: ${why}. Check the key, its permissions, and IP restrictions.`, permissions: [] }
      }
      const usdt = (acct.j?.balances ?? []).find((b: any) => b.asset === 'USDT')
      this.usdtFree = Number(usdt?.free ?? 0)
      this.cacheBalances(acct.j)
      // Exchange filters so order quantities respect Binance's lot rules
      try {
        const symbols = encodeURIComponent(JSON.stringify(Object.values(SYMBOL_MAP)))
        const r = await fetch(`https://api.binance.com/api/v3/exchangeInfo?symbols=${symbols}`, { signal: AbortSignal.timeout(10000) })
        const j = r.ok ? await r.json() : null
        for (const s of j?.symbols ?? []) {
          const lot = (s.filters ?? []).find((f: any) => f.filterType === 'LOT_SIZE')
          const notional = (s.filters ?? []).find((f: any) => f.filterType === 'NOTIONAL' || f.filterType === 'MIN_NOTIONAL')
          this.filters[s.symbol] = {
            stepSize: Number(lot?.stepSize ?? 0.00001),
            minQty: Number(lot?.minQty ?? 0),
            minNotional: Number(notional?.minNotional ?? 10)
          }
        }
      } catch { /* filters fall back to defaults */ }
      this.st = 'connected'
      // Binance reports spot trade capability in three shapes depending on the
      // account: canTrade=true, permissions containing 'SPOT', or (newer
      // accounts) trade-group codes like 'TRD_GRP_009'. Checking only 'SPOT'
      // falsely reported enabled keys as read-only.
      const perms: string[] = Array.isArray(acct.j?.permissions) ? acct.j.permissions : []
      const canTrade = acct.j?.canTrade === true || perms.includes('SPOT') || perms.some(p => String(p).startsWith('TRD_GRP'))
      AuditLogger.info('BROKER', 'Binance connected', `Spot USDT available: ${this.usdtFree.toFixed(2)}. Trading permission: ${canTrade ? 'yes' : 'no'}.`)
      return {
        ok: true,
        message: `Connected. USDT available: ${this.usdtFree.toFixed(2)}. Long-only spot orders${canTrade ? '' : ' — key lacks SPOT trade permission'}. Live routing additionally requires the live-trading unlock chain.`,
        permissions: canTrade ? ['read:balances', 'trade:spot (long/close only)'] : ['read:balances']
      }
    } catch (e) {
      this.st = 'error'
      AuditLogger.warn('BROKER', 'Binance unreachable', String(e))
      return { ok: false, message: 'Could not reach Binance\'s signed API from this environment (browsers are often blocked by CORS — run the 24/7 server, which has no such limit). Credentials are stored locally.', permissions: [] }
    }
  }

  disconnect(): void {
    this.st = 'disconnected'
    AuditLogger.info('BROKER', 'Binance disconnected')
  }

  private roundQty(symbol: string, qty: number): number {
    const f = this.filters[symbol]
    if (!f?.stepSize) return Math.floor(qty * 1e5) / 1e5
    const steps = Math.floor(qty / f.stepSize)
    return Number((steps * f.stepSize).toFixed(8))
  }

  previewOrder(req: OrderRequest, _cash: number): OrderPreview {
    const symbol = SYMBOL_MAP[req.symbol]
    // Fee-aware close clamp: a spot BUY pays its fee in the BASE asset, so the
    // account holds slightly less than the ledger's recorded qty. Selling the
    // recorded qty would exceed the free balance and be rejected (-2010).
    // For reduce-only orders, never ask for more than the account can sell.
    if (req.reduceOnly && symbol) {
      const baseAsset = req.symbol.split('/')[0]
      const free = this.freeOf(baseAsset)
      if (free > 0 && free < req.qty) req = { ...req, qty: free }
    }
    const value = req.qty * req.refPrice
    const base = { request: req, estimatedValue: value, estimatedSlippagePct: 0.05, commission: value * 0.001 }
    if (this.st !== 'connected') return { ...base, ok: false, note: 'Binance not connected.' }
    if (!symbol) return { ...base, ok: false, note: `${req.symbol} is not mapped to a Binance spot pair.` }
    if (req.direction === 'Short' && !req.reduceOnly) {
      return { ...base, ok: false, note: 'Spot accounts cannot open short positions — short signal skipped for Binance.' }
    }
    const qty = this.roundQty(symbol, req.qty)
    const f = this.filters[symbol]
    if (f && qty < f.minQty) return { ...base, ok: false, note: `Quantity ${qty} below Binance minimum ${f.minQty}.` }
    if (f && qty * req.refPrice < f.minNotional) return { ...base, ok: false, note: `Order value below Binance minimum notional (${f.minNotional} USDT).` }
    if (!req.reduceOnly && qty * req.refPrice > this.usdtFree * 0.98) {
      return { ...base, ok: false, note: `Insufficient USDT on Binance: order ≈ ${(qty * req.refPrice).toFixed(2)}, available ${this.usdtFree.toFixed(2)}. Lower the allocation %.` }
    }
    return { ...base, ok: true, note: `Spot MARKET ${req.direction === 'Long' && !req.reduceOnly ? 'BUY' : 'SELL'} ${qty} ${symbol} ≈ ${(qty * req.refPrice).toFixed(2)} USDT.` }
  }

  async placeOrder(preview: OrderPreview): Promise<OrderResult> {
    if (!preview.ok) return { ok: false, reason: preview.note }
    const req = preview.request
    const symbol = SYMBOL_MAP[req.symbol]
    const qty = this.roundQty(symbol, req.qty)
    const side = req.direction === 'Long' && !req.reduceOnly ? 'BUY' : 'SELL'
    try {
      const r = await this.signed('/api/v3/order', { symbol, side, type: 'MARKET', quantity: qty }, 'POST')
      if (!r.ok || !r.j?.orderId) {
        const why = r.j?.msg ?? `HTTP ${r.status}`
        AuditLogger.error('BROKER', `Binance order rejected: ${side} ${qty} ${symbol}`, String(why))
        return { ok: false, reason: `Binance rejected the order: ${why}` }
      }
      const fills: any[] = r.j.fills ?? []
      const executed = Number(r.j.executedQty ?? qty)
      const quote = Number(r.j.cummulativeQuoteQty ?? 0)
      const fillPrice = fills.length
        ? fills.reduce((a, f) => a + Number(f.price) * Number(f.qty), 0) / fills.reduce((a, f) => a + Number(f.qty), 0)
        : (executed > 0 && quote > 0 ? quote / executed : req.refPrice)
      // Fees charged in the BASE asset (typical for BUYs without BNB) reduce
      // what the account actually holds — report the NET quantity so the
      // ledger position matches the sellable balance.
      const baseFee = fills.reduce((a, f) =>
        a + (f.commissionAsset && symbol.startsWith(String(f.commissionAsset)) ? Number(f.commission) : 0), 0)
      const filledQty = side === 'BUY' ? Math.max(0, executed - baseFee) : executed
      // refresh available balance opportunistically
      void this.sync()
      AuditLogger.warn('BROKER', `LIVE BINANCE FILL: ${side} ${executed} ${symbol} @ ${fillPrice.toFixed(4)}`,
        `Order ${r.j.orderId}. Net after base-asset fees: ${filledQty}. Your Binance account is the authoritative record.`)
      return { ok: true, orderId: String(r.j.orderId), fillPrice, filledQty, commission: quote * 0.001 }
    } catch (e) {
      AuditLogger.error('BROKER', 'Binance order transmission failed', String(e))
      return { ok: false, reason: `Binance transmission error: ${String(e).slice(0, 120)}` }
    }
  }

  cancelOrder(_orderId: string): boolean { return false } // market orders fill immediately

  async sync(): Promise<{ ok: boolean; message: string }> {
    if (this.st !== 'connected') return { ok: false, message: 'Not connected.' }
    try {
      const acct = await this.signed('/api/v3/account', {})
      if (!acct.ok) { this.st = 'error'; return { ok: false, message: `Binance sync failed: ${acct.j?.msg ?? acct.status}` } }
      const usdt = (acct.j?.balances ?? []).find((b: any) => b.asset === 'USDT')
      this.usdtFree = Number(usdt?.free ?? 0)
      this.cacheBalances(acct.j)
      return { ok: true, message: `Binance balances refreshed. USDT available: ${this.usdtFree.toFixed(2)}.` }
    } catch (e) {
      return { ok: false, message: `Binance sync error: ${String(e).slice(0, 80)}` }
    }
  }
}
