import type { CustomFeed, PriceSource } from '../types'
import { AuditLogger } from './AuditLogger'

/**
 * MarketDataService — live price feeds for paper trading, using free APIs:
 *  - Crypto (BTC/ETH/SOL): CoinGecko — free, no key, CORS-enabled.
 *  - Forex (EUR/USD, USD/JPY): Frankfurter (ECB reference rates) — free, no key.
 *  - Stocks/ETFs: Finnhub free tier — requires the user's own API key,
 *    stored only in their browser and sent only to finnhub.io.
 *  - Commodities: no reliable keyless browser-accessible feed — simulated,
 *    and labeled as such in the UI.
 * When a broker (IBKR) is connected with a live gateway session, its market
 * data feed takes precedence (source: 'broker').
 * All failures degrade gracefully to the simulator; errors never break ticks.
 */

export interface LiveQuote { price: number; source: PriceSource }

const COINGECKO_IDS: Record<string, string> = {
  'BTC/USD': 'bitcoin', 'ETH/USD': 'ethereum', 'SOL/USD': 'solana',
  'DOGE/USD': 'dogecoin', 'XRP/USD': 'ripple', 'AVAX/USD': 'avalanche-2',
  'LINK/USD': 'chainlink', 'ADA/USD': 'cardano'
}
// Same venue we execute on — Binance is the primary crypto source for both
// history (klines) and live quotes; CoinGecko is the graceful fallback.
const BINANCE_PAIRS: Record<string, string> = {
  'BTC/USD': 'BTCUSDT', 'ETH/USD': 'ETHUSDT', 'SOL/USD': 'SOLUSDT',
  'DOGE/USD': 'DOGEUSDT', 'XRP/USD': 'XRPUSDT', 'AVAX/USD': 'AVAXUSDT',
  'LINK/USD': 'LINKUSDT', 'ADA/USD': 'ADAUSDT'
}
const FINNHUB_SYMBOLS = ['AAPL', 'NVDA', 'MSFT', 'TSLA', 'SPY', 'QQQ']

let fxCache: Record<string, number> = {}
let fxFetchedAt = 0
let loggedLive = false
let loggedFail = false

async function getJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    return await r.json()
  } catch { return null }
}

function jsonPath(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
}

const seededHistory = new Set<string>()

export const MarketDataService = {
  /**
   * Seed real price history for live crypto assets (CoinGecko hourly, ~2 days)
   * so momentum/volatility scores are computed from real data, not simulated
   * warmup. Runs once per symbol per session.
   */
  async seedCryptoHistory(): Promise<Record<string, number[]>> {
    const out: Record<string, number[]> = {}
    await Promise.all(Object.entries(BINANCE_PAIRS).map(async ([sym, pair]) => {
      if (seededHistory.has(sym)) return
      // Primary: Binance klines — real 5-minute closes from the same venue we
      // execute on (limit 200 → HISTORY_CAP keeps the most recent 160).
      let prices: number[] | undefined
      const k = await getJson(`https://api.binance.com/api/v3/klines?symbol=${pair}&interval=5m&limit=200`)
      if (Array.isArray(k) && k.length > 20) {
        prices = k.map((c: any[]) => Number(c[4])).filter((x: number) => Number.isFinite(x) && x > 0)
      }
      // Fallback: CoinGecko 5-minute (days=1) if Binance is unreachable/geo-blocked.
      if (!prices || prices.length < 20) {
        const id = COINGECKO_IDS[sym]
        const j = await getJson(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=1`)
        prices = j?.prices?.map((p: [number, number]) => p[1])
      }
      if (prices && prices.length > 20) {
        out[sym] = prices.slice(-160)
        seededHistory.add(sym)
      }
    }))
    if (Object.keys(out).length) {
      AuditLogger.info('MARKET', `Real price history seeded for ${Object.keys(out).join(', ')}`,
        'Momentum and volatility scores computed from actual Binance 5-minute klines (CoinGecko fallback), ~13h.')
    }
    return out
  },

  /**
   * Seed real 5-min history for stocks/ETFs via Finnhub candles (free-tier
   * availability varies; failures are silent and the simulator history is
   * purged instead so scores build honestly from live bars).
   */
  async seedStockHistory(finnhubKey: string): Promise<Record<string, number[]>> {
    const out: Record<string, number[]> = {}
    if (!finnhubKey) return out
    const to = Math.floor(Date.now() / 1000)
    const from = to - 13 * 3600
    await Promise.all(FINNHUB_SYMBOLS.map(async sym => {
      if (seededHistory.has(sym)) return
      const j = await getJson(`https://finnhub.io/api/v1/stock/candle?symbol=${sym}&resolution=5&from=${from}&to=${to}&token=${encodeURIComponent(finnhubKey)}`)
      if (j?.s === 'ok' && Array.isArray(j.c) && j.c.length > 20) {
        out[sym] = j.c.slice(-160)
        seededHistory.add(sym)
      }
    }))
    if (Object.keys(out).length) {
      AuditLogger.info('MARKET', `Real price history seeded for ${Object.keys(out).join(', ')}`, 'Finnhub 5-minute candles.')
    }
    return out
  },

  async fetchQuotes(finnhubKey: string, customFeeds: CustomFeed[] = []): Promise<Record<string, LiveQuote>> {
    const out: Record<string, LiveQuote> = {}

    // Custom feeds (user-configured providers) — applied first so specific
    // integrations can be overridden by nothing; built-ins fill the rest.
    await Promise.all(customFeeds.map(async f => {
      try {
        const headers: Record<string, string> = {}
        if (f.headerName && f.headerValue) headers[f.headerName] = f.headerValue
        const r = await fetch(f.url, { headers, signal: AbortSignal.timeout(8000) })
        if (!r.ok) return
        const j = await r.json()
        const p = Number(jsonPath(j, f.jsonPath))
        if (Number.isFinite(p) && p > 0) out[f.symbol] = { price: p, source: 'custom' }
      } catch { /* feed down — fall through to built-ins/simulation */ }
    }))

    // Crypto — Binance spot REST (same venue as execution). This is the REST
    // fallback layer; sub-second live ticks come from the Binance WebSocket
    // stream (LiveStream.ts). CoinGecko backs up any symbol Binance can't serve.
    const pairsParam = encodeURIComponent(JSON.stringify(Object.values(BINANCE_PAIRS)))
    const bt = await getJson(`https://api.binance.com/api/v3/ticker/price?symbols=${pairsParam}`)
    if (Array.isArray(bt)) {
      const pairToSym = Object.fromEntries(Object.entries(BINANCE_PAIRS).map(([s, p]) => [p, s]))
      for (const row of bt) {
        const sym = pairToSym[row?.symbol]
        const p = Number(row?.price)
        if (sym && p > 0 && !out[sym]) out[sym] = { price: p, source: 'binance' }
      }
    }
    // CoinGecko fallback for any crypto Binance didn't return
    const missing = Object.keys(COINGECKO_IDS).filter(s => !out[s])
    if (missing.length) {
      const ids = missing.map(s => COINGECKO_IDS[s]).join(',')
      const cg = await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`)
      if (cg) {
        for (const sym of missing) {
          const p = cg[COINGECKO_IDS[sym]]?.usd
          if (typeof p === 'number' && p > 0) out[sym] = { price: p, source: 'coingecko' }
        }
      }
    }

    // Forex — Frankfurter (ECB daily reference; refresh every 5 minutes)
    if (Date.now() - fxFetchedAt > 5 * 60_000 || !fxCache['EUR/USD']) {
      const [eur, jpy] = await Promise.all([
        getJson('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD'),
        getJson('https://api.frankfurter.dev/v1/latest?base=USD&symbols=JPY')
      ])
      if (eur?.rates?.USD) fxCache['EUR/USD'] = eur.rates.USD
      if (jpy?.rates?.JPY) fxCache['USD/JPY'] = jpy.rates.JPY
      if (eur || jpy) fxFetchedAt = Date.now()
    }
    for (const sym of ['EUR/USD', 'USD/JPY']) {
      if (fxCache[sym] && !out[sym]) out[sym] = { price: fxCache[sym], source: 'frankfurter' }
    }

    // Stocks / ETFs — Finnhub, only with a user-supplied key
    if (finnhubKey) {
      await Promise.all(FINNHUB_SYMBOLS.map(async sym => {
        if (out[sym]) return
        const q = await getJson(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${encodeURIComponent(finnhubKey)}`)
        if (q && typeof q.c === 'number' && q.c > 0) out[sym] = { price: q.c, source: 'finnhub' }
      }))
    }

    // One-time audit notes so the user can see what the data layer is doing
    const liveCount = Object.keys(out).length
    if (liveCount > 0 && !loggedLive) {
      loggedLive = true
      AuditLogger.info('MARKET', `Live market data active for ${liveCount} asset(s)`,
        `Sources: CoinGecko (crypto), Frankfurter/ECB (FX)${finnhubKey ? ', Finnhub (stocks/ETFs)' : ''}. Remaining assets are simulated and labeled as such.`)
    }
    if (liveCount === 0 && !loggedFail) {
      loggedFail = true
      AuditLogger.warn('MARKET', 'Live data feeds unreachable — running fully on simulated prices',
        'CoinGecko/Frankfurter requests failed (offline or rate-limited). Will keep retrying every 30s.')
    }
    return out
  }
}
