/**
 * LiveStream — real-time price streaming via Binance's free public
 * WebSocket (no key required). Sub-second trade ticks for crypto.
 * Falls back silently to the 30s REST polling layer when WebSocket is
 * unavailable (e.g., older Node on the server daemon) or disconnected.
 */

const STREAM_MAP: Record<string, string> = {
  BTCUSDT: 'BTC/USD',
  ETHUSDT: 'ETH/USD',
  SOLUSDT: 'SOL/USD'
}

export const wsQuotes: Record<string, { price: number; ts: number }> = {}

let ws: WebSocket | null = null
let started = false

export function startStream(): void {
  if (started || typeof WebSocket === 'undefined') { started = true; return }
  started = true
  connect()
}

function connect(): void {
  try {
    const streams = Object.keys(STREAM_MAP).map(s => `${s.toLowerCase()}@trade`).join('/')
    ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`)
    ws.onmessage = e => {
      try {
        const m = JSON.parse(String(e.data))
        const sym = STREAM_MAP[m?.data?.s ?? '']
        const p = Number(m?.data?.p)
        if (sym && Number.isFinite(p) && p > 0) wsQuotes[sym] = { price: p, ts: Date.now() }
      } catch { /* malformed frame — ignore */ }
    }
    ws.onclose = () => { ws = null; setTimeout(connect, 5000) } // auto-reconnect
    ws.onerror = () => { try { ws?.close() } catch { /* noop */ } }
  } catch { ws = null }
}

/** Quotes fresher than 15s, ready to merge into the engine tick. */
export function freshWsQuotes(): Record<string, { price: number }> {
  const out: Record<string, { price: number }> = {}
  const now = Date.now()
  for (const [sym, q] of Object.entries(wsQuotes)) {
    if (now - q.ts < 15_000) out[sym] = { price: q.price }
  }
  return out
}
