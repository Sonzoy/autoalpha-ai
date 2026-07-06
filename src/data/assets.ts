import type { AssetDef } from '../types'

export const ASSET_UNIVERSE: AssetDef[] = [
  // Crypto — high volatility
  { symbol: 'BTC/USD', name: 'Bitcoin', market: 'Crypto', basePrice: 64200, vol: 0.55, decimals: 0 },
  { symbol: 'ETH/USD', name: 'Ethereum', market: 'Crypto', basePrice: 3120, vol: 0.65, decimals: 1 },
  { symbol: 'SOL/USD', name: 'Solana', market: 'Crypto', basePrice: 148, vol: 0.85, decimals: 2 },
  { symbol: 'DOGE/USD', name: 'Dogecoin', market: 'Crypto', basePrice: 0.13, vol: 1.05, decimals: 5 },
  { symbol: 'XRP/USD', name: 'XRP', market: 'Crypto', basePrice: 0.52, vol: 0.9, decimals: 4 },
  { symbol: 'AVAX/USD', name: 'Avalanche', market: 'Crypto', basePrice: 27, vol: 1.0, decimals: 2 },
  { symbol: 'LINK/USD', name: 'Chainlink', market: 'Crypto', basePrice: 13.5, vol: 0.95, decimals: 3 },
  { symbol: 'ADA/USD', name: 'Cardano', market: 'Crypto', basePrice: 0.38, vol: 0.9, decimals: 4 },
  // Stocks
  { symbol: 'AAPL', name: 'Apple Inc.', market: 'Stocks', basePrice: 214, vol: 0.24, decimals: 2 },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', market: 'Stocks', basePrice: 128, vol: 0.42, decimals: 2 },
  { symbol: 'MSFT', name: 'Microsoft Corp.', market: 'Stocks', basePrice: 447, vol: 0.22, decimals: 2 },
  { symbol: 'TSLA', name: 'Tesla Inc.', market: 'Stocks', basePrice: 246, vol: 0.55, decimals: 2 },
  // ETFs
  { symbol: 'SPY', name: 'S&P 500 ETF', market: 'ETFs', basePrice: 545, vol: 0.14, decimals: 2 },
  { symbol: 'QQQ', name: 'Nasdaq-100 ETF', market: 'ETFs', basePrice: 478, vol: 0.18, decimals: 2 },
  // Forex
  { symbol: 'EUR/USD', name: 'Euro / US Dollar', market: 'Forex', basePrice: 1.084, vol: 0.08, decimals: 4 },
  { symbol: 'USD/JPY', name: 'US Dollar / Yen', market: 'Forex', basePrice: 157.2, vol: 0.09, decimals: 2 },
  // Commodities
  { symbol: 'XAU/USD', name: 'Gold Spot', market: 'Commodities', basePrice: 2330, vol: 0.13, decimals: 1 },
  { symbol: 'WTI/USD', name: 'WTI Crude Oil', market: 'Commodities', basePrice: 81.4, vol: 0.30, decimals: 2 }
]
