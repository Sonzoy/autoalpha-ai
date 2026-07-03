import type { PriceSource } from '../types'
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
  'BTC/USD': 'bitcoin', 'ETH/USD': 'ethereum', 'SOL/USD': 'solana'
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

export const MarketDataService = {
  async fetchQuotes(finnhubKey: string): Promise<Record<string, LiveQuote>> {
    const out: Record<string, LiveQuote> = {}

    // Crypto — CoinGecko
    const ids = Object.values(COINGECKO_IDS).join(',')
    const cg = await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`)
    if (cg) {
      for (const [sym, id] of Object.entries(COINGECKO_IDS)) {
        const p = cg[id]?.usd
        if (typeof p === 'number' && p > 0) out[sym] = { price: p, source: 'coingecko' }
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
      if (fxCache[sym]) out[sym] = { price: fxCache[sym], source: 'frankfurter' }
    }

    // Stocks / ETFs — Finnhub, only with a user-supplied key
    if (finnhubKey) {
      await Promise.all(FINNHUB_SYMBOLS.map(async sym => {
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
